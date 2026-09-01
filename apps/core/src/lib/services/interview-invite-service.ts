import type { InfraProvider } from '@coploy/infra'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import type { Company, PostJob } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { renderInterviewInviteEmail } from '@/emails/interview-invite'
import { env } from '@/env'
import {
	createEmailTemplateResolver,
	withCustomSubject,
} from '@/lib/services/email-template-resolver'
import { createEmailBrandingService } from '@/lib/services/email-branding-service'
import { createOutboxWriter } from '@/lib/events/outbox-writer'
import { PostmarkClient } from '@/lib/postmark-client'

const INVITE_FROM_EMAIL = 'no-reply@coploy.io'
/** Etapa em que o candidato entra ao ser convidado (régua canônica). */
const INTERVIEW_STAGE = 'Pending'
const MAX_INVITES_PER_CALL = 50

export type InterviewInviteEmailClient = EmailSender

export interface InviteToInterviewInput {
	companyId: string
	jobId: string
	/** Ids de candidato no board (mesma chave do bulk-status). */
	candidateIds: string[]
	/** Recado do recrutador; entra no corpo antes do botão. */
	message?: string
	invitedByUserId?: string
}

export interface InterviewInviteResult {
	candidateId: string
	status: 'sent' | 'moved_without_email' | 'skipped'
	reason?: string
}

type InterviewDoc = {
	finished?: boolean | null
	email?: string | null
	name?: string | null
	language?: string | null
	candidateStatus?: string | null
	candidate_status?: string | null
	user_ref?: { path?: string } | null
	job_applied_ref?: { path?: string } | null
}

function refId(ref?: { path?: string } | null): string | undefined {
	return ref?.path?.split('/').pop()
}

/**
 * Convite para a entrevista IA — a ação primária do Pipeline.
 *
 * É o elo que faltava entre "se candidatou" e "entrevistou". O apply leve
 * (TOS-020) já registrava a candidatura sem mídia, mas nada levava esse
 * candidato até a entrevista, então a etapa Candidatura seria um depósito.
 *
 * Regra: MOVER sempre, e-mail quando der. O status é o dado do funil e não
 * pode ficar refém do Postmark — se o candidato não tem e-mail ou o provedor
 * cai, ele ainda avança e a resposta diz o que aconteceu com cada um, em vez
 * de estourar a chamada inteira e deixar o board mentindo.
 */
export function createInterviewInviteService(
	infra: InfraProvider,
	deps: { emailClient?: InterviewInviteEmailClient } = {},
) {
	const emailClient = deps.emailClient ?? createEmailSender(infra)
	const outbox = createOutboxWriter(infra)
	const templates = createEmailTemplateResolver(infra)
	const branding = createEmailBrandingService(infra)

	function buildInterviewUrl(companyId: string, jobId: string): string {
		/*
		 * Decisão 1 (martelo 2026-08-23): o convite aponta pra PÁGINA DA VAGA NO
		 * PORTAL — nunca direto pra sala. O candidato entra sempre pela mesma
		 * porta (contexto, candidatura, OTS) e a sala o recebe já autenticado.
		 * `CAREERS_BASE_URL` presente = instalação com portal (open); ausente =
		 * comportamento SaaS de sempre (link direto da sala).
		 */
		const portalBase = env.CAREERS_BASE_URL?.replace(/\/+$/, '')
		if (portalBase) {
			return `${portalBase}/${encodeURIComponent(companyId)}/vagas/${encodeURIComponent(jobId)}?src=invite`
		}
		const baseUrl = env.INTERVIEW_BASE_URL.replace(/\/+$/, '')
		// `?src=invite` (V2-601): distingue quem o recrutador chamou de quem
		// chegou sozinho — é metade da resposta de "de onde vêm os melhores".
		return `${baseUrl}/job/${encodeURIComponent(jobId)}/company/${encodeURIComponent(companyId)}/login?src=invite`
	}

	return {
		async inviteToInterview(input: InviteToInterviewInput) {
			const { companyId, jobId, candidateIds, message, invitedByUserId } = input
			if (candidateIds.length === 0) {
				throw new BadRequestError('candidateIds must not be empty')
			}
			if (candidateIds.length > MAX_INVITES_PER_CALL) {
				throw new BadRequestError(`candidateIds must not exceed ${MAX_INVITES_PER_CALL} items`)
			}

			const [company, job] = await Promise.all([
				infra.companyRepository.getCompany(companyId) as Promise<Company | null>,
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
			])
			if (!company) throw new NotFoundError('Company not found')
			if (!job) throw new NotFoundError('Job not found')
			// decisão 2 (martelo 2026-08-23): vaga sem pergunta não convida — o
			// candidato entraria numa sala vazia. A tela também esconde, mas a
			// regra mora aqui.
			const questionCount =
				(job.jobQuestions?.length ?? 0) + (job.additionalQuestions?.length ?? 0)
			if (questionCount === 0) {
				throw new BadRequestError(
					'A vaga ainda não tem perguntas de entrevista — adicione perguntas antes de convidar',
				)
			}

			const interviewUrl = buildInterviewUrl(companyId, jobId)
			// marca da EMPRESA no e-mail do candidato 
			const companyBranding = await branding.forCompany(company as Company & { id: string })
			const now = new Date().toISOString()
			const movedAt = new Date()
			const results: InterviewInviteResult[] = []

			for (const candidateId of candidateIds) {
				const interview = (await infra.candidateRepository
					.getJobInterview(companyId, jobId, candidateId)
					.catch(() => null)) as InterviewDoc | null

				if (!interview) {
					results.push({ candidateId, status: 'skipped', reason: 'not_found' })
					continue
				}

				/*
				 * Quem JÁ ENTREVISTOU não se convida de novo.
				 *
				 * Sem esta guarda o convite fazia estrago em três frentes: mandava
				 * ao candidato um e-mail pedindo uma entrevista que ele já fez,
				 * movia a ficha de volta para "Entrevista IA" (perdendo a posição
				 * real dele no funil) e ainda reiniciava o relógio da etapa. E era
				 * fácil de disparar sem querer: o "Convidar todos" pega a etapa de
				 * entrada inteira, incluindo quem terminou a entrevista e continua
				 * lá esperando triagem.
				 *
				 * A guarda mora aqui, e não só na tela, porque o dano é do lado do
				 * candidato — e a API é chamada por mais de uma superfície.
				 */
				if (interview.finished === true) {
					results.push({ candidateId, status: 'skipped', reason: 'already_finished' })
					continue
				}

				const fromStatus =
					interview.candidateStatus || interview.candidate_status || 'Applied'

				// Move primeiro: é o dado que o board mostra. `dateSelect` reinicia o
				// relógio da etapa, senão o candidato entra em Entrevista IA já
				// contando o tempo que passou na Candidatura.
				const updateData = {
					candidate_status: INTERVIEW_STAGE,
					candidateStatus: INTERVIEW_STAGE,
					date_select: movedAt,
					dateSelect: movedAt,
					interviewInvitedAt: movedAt,
					updated_at: now,
				}
				await infra.candidateRepository.updateJobInterview(
					companyId,
					jobId,
					candidateId,
					updateData,
				)
				await infra.candidateRepository.updateCompanyInterview(companyId, candidateId, updateData)

				const userUid = refId(interview.user_ref)
				const jobAppliedId = refId(interview.job_applied_ref)
				if (userUid && jobAppliedId) {
					await infra.candidateRepository
						.updateJobApplied(userUid, jobAppliedId, {
							candidateStatus: INTERVIEW_STAGE,
							dateSelect: movedAt,
							interviewInvitedAt: movedAt,
							updated_at: now,
						})
						.catch(() => undefined)
				}

				await outbox
					.write({
						type: 'candidatura_movida',
						companyId,
						payload: {
							applicationId: jobAppliedId ?? candidateId,
							jobId,
							fromStatus,
							toStatus: INTERVIEW_STAGE,
							...(invitedByUserId ? { movedByUserId: invitedByUserId } : {}),
							source: 'interview_invite',
							occurredAt: now,
						},
					})
					.catch((error) => {
						console.error('[InterviewInvite] failed to write event:', error)
					})

				const email = interview.email?.trim()
				if (!email) {
					results.push({ candidateId, status: 'moved_without_email', reason: 'no_email' })
					continue
				}

				/*
				 * Template da empresa: assunto e mensagem. A mensagem digitada no
				 * convite tem precedência — quem escreveu agora quis dizer aquilo,
				 * não o texto padrão de meses atrás.
				 */
				const custom = await templates.resolve(companyId, 'interview_invite', {
					candidato: interview.name,
					vaga: job.jobName,
					empresa: company.companyName,
					link: interviewUrl,
				})

				const rendered = withCustomSubject(
					renderInterviewInviteEmail({
						candidateName: interview.name ?? null,
						jobName: job.jobName ?? null,
						companyName: company.companyName ?? null,
						interviewUrl,
						message: message?.trim() || custom.body,
						language: interview.language ?? job.language ?? null,
						branding: companyBranding,
					}),
					custom.subject,
				)

				try {
					await emailClient.sendEmail({
						from: INVITE_FROM_EMAIL,
						to: email,
						subject: rendered.subject,
						htmlBody: rendered.htmlBody,
						textBody: rendered.textBody,
						tag: 'interview-invite',
					})
					results.push({ candidateId, status: 'sent' })
				} catch (error) {
					console.error('[InterviewInvite] failed to send email:', error)
					results.push({ candidateId, status: 'moved_without_email', reason: 'email_failed' })
				}
			}

			return {
				invited: results.filter((r) => r.status !== 'skipped').length,
				sent: results.filter((r) => r.status === 'sent').length,
				interviewUrl,
				results,
			}
		},

		/**
		 * Reengajar candidato da base numa vaga aberta (V2-603, GAP 6).
		 *
		 * ~44% das contratações sourced vêm da própria base. A pessoa já foi
		 * avaliada, já conhece a empresa, e estava a zero cliques de distância —
		 * só não havia como chamá-la de volta.
		 *
		 * **Não** cria candidatura no lugar dela.** Fabricar um `jobApplied` para
		 * quem não pediu encheria o funil de gente que nunca disse sim: o board
		 * mostraria candidato, o SLA começaria a correr, e o recrutador cobraria
		 * resposta de quem não se candidatou. O que sai daqui é o convite; quem
		 * entra é ela, pelo link (`?src=invite`), e aí o funil é verdade.
		 */
		async reengageToJob(input: {
			companyId: string
			jobId: string
			/** uids de `users/{id}` — vêm da tela de Candidatos da empresa. */
			userIds: string[]
			message?: string
			invitedByUserId?: string
		}) {
			const { companyId, jobId, userIds, message } = input
			if (userIds.length === 0) throw new BadRequestError('userIds must not be empty')
			if (userIds.length > MAX_INVITES_PER_CALL) {
				throw new BadRequestError(`userIds must not exceed ${MAX_INVITES_PER_CALL} items`)
			}

			const [company, job] = await Promise.all([
				infra.companyRepository.getCompany(companyId) as Promise<Company | null>,
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
			])
			if (!company) throw new NotFoundError('Company not found')
			if (!job) throw new NotFoundError('Job not found')
			// Convidar para vaga fechada gera candidato entrando num processo que
			// não existe — falha antes de mandar o primeiro e-mail.
			if (job.stopped === true) {
				throw new BadRequestError('Job is not open — reopen it before re-engaging candidates')
			}

			const interviewUrl = buildInterviewUrl(companyId, jobId)
			// marca da EMPRESA no e-mail do candidato 
			const companyBranding = await branding.forCompany(company as Company & { id: string })
			const results: InterviewInviteResult[] = []

			for (const userId of userIds) {
				/*
				 * Identidade e currículo, juntos.
				 *
				 * O idioma da pessoa mora no **currículo** (`candidateProfile`), não
				 * no doc de identidade — é lá que o chat, o app do candidato e o
				 * plugin gravam. Lendo só `users/{uid}`, o convite caía no idioma da
				 * VAGA: um candidato brasileiro recebeu "Interview invitation" em
				 * inglês porque a vaga estava escrita em inglês.
				 *
				 * A vaga continua valendo como último recurso — vaga em inglês sem
				 * saber nada da pessoa é palpite melhor que o default.
				 */
				const [user, profile] = await Promise.all([
					Promise.resolve(infra.userRepository.getUser(userId)).catch(() => null) as Promise<{
						email?: string | null
						display_name?: string | null
						language?: string | null
					} | null>,
					Promise.resolve(infra.userRepository.getCandidateProfile(userId)).catch(
						() => null,
					) as Promise<{ language?: string | null; email?: string | null } | null>,
				])

				const email = user?.email?.trim() || profile?.email?.trim()
				if (!email) {
					results.push({ candidateId: userId, status: 'skipped', reason: 'no_email' })
					continue
				}

				const rendered = renderInterviewInviteEmail({
					candidateName: user?.display_name ?? null,
					jobName: job.jobName ?? null,
					companyName: company.companyName ?? null,
					interviewUrl,
					message,
					// pessoa > vaga > default
					language: user?.language ?? profile?.language ?? job.language ?? null,
					branding: companyBranding,
				})

				try {
					await emailClient.sendEmail({
						from: INVITE_FROM_EMAIL,
						to: email,
						subject: rendered.subject,
						htmlBody: rendered.htmlBody,
						textBody: rendered.textBody,
						tag: 'candidate-reengage',
					})
					results.push({ candidateId: userId, status: 'sent' })
				} catch (error) {
					console.error('[Reengage] failed to send email:', error)
					results.push({ candidateId: userId, status: 'skipped', reason: 'email_failed' })
				}
			}

			return {
				invited: userIds.length,
				sent: results.filter((r) => r.status === 'sent').length,
				interviewUrl,
				results,
			}
		},
	}
}
