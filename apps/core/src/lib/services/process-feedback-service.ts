import { randomUUID } from 'node:crypto'

import type { InfraProvider } from '@coploy/infra'
import type { Company, PostJob, ProcessFeedback, ProcessFeedbackStage, UsersCompany } from '@coploy/domain'
import { processReasonFromRejection, processStageFromRejection } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'

import { renderProcessFeedbackEmail } from '@/emails/process-update'
import { env } from '@/env'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { createEmailBrandingService } from '@/lib/services/email-branding-service'
import { validateCandidateFeedbackOrThrow } from '@/lib/services/feedback-guardrails'
import { resolveBoardCandidate } from '@/lib/services/interview-schedule-service'

/**
 * Retorno do processo ao talento (OTS 0.3, `submit_feedback`) — a referência.
 *
 * Duas fontes: o recrutador escreve pela ficha do candidato (andamento:
 * recebido, em análise, avançou, contratado), e a reprovação com retorno vira
 * `not_selected` sozinha, com o motivo traduzido só quando o candidato pode
 * vê-lo. Terminar o processo pelo retorno não existe: quem reprova é o quadro,
 * para não haver retorno dizendo uma coisa e quadro dizendo outra.
 */

const FROM_EMAIL = 'no-reply@coploy.io'

/** O que o recrutador pode mandar à mão. Os de encerramento vêm do quadro. */
export const MANUAL_FEEDBACK_STAGES: ProcessFeedbackStage[] = ['received', 'in_review', 'interview_scheduled', 'advanced', 'hired']

function refId(value: unknown): string | null {
	const path = (value as { path?: string } | undefined)?.path
	if (path) return path.split('/').pop() ?? null
	if (typeof value === 'string') return value
	return (value as { id?: string } | undefined)?.id ?? null
}

export function createProcessFeedbackService(
	infra: InfraProvider,
	emailClient: EmailSender = createEmailSender(infra),
) {
	const branding = createEmailBrandingService(infra)
	const repo = infra.processFeedbackRepository

	return {
		async listForCandidate(params: { companyId: string; jobId: string; candidateId: string }) {
			const board = await resolveBoardCandidate(infra, params.companyId, params.jobId, params.candidateId)
			return repo.listByApplication(params.companyId, board.jobAppliedId)
		},

		async listMine(userId: string) {
			return repo.listByUser(userId)
		},

		async send(params: {
			companyId: string
			jobId: string
			candidateId: string
			actorId: string | null
			actorName: string | null
			stage: ProcessFeedbackStage
			message: string
			nextStep?: string | null
		}): Promise<ProcessFeedback> {
			if (!MANUAL_FEEDBACK_STAGES.includes(params.stage)) {
				throw new BadRequestError('Para encerrar o processo, reprove pelo quadro — o retorno vai junto')
			}
			const message = params.message.trim()
			if (!message) throw new BadRequestError('Escreva o retorno: status sem explicação é o que o candidato não pode receber')
			if (message.length > 4000) throw new BadRequestError('Retorno longo demais (máximo 4000 caracteres)')
			validateCandidateFeedbackOrThrow(message)
			const nextStep = params.nextStep?.trim().slice(0, 1000) || null

			const board = await resolveBoardCandidate(infra, params.companyId, params.jobId, params.candidateId)
			const feedback: ProcessFeedback = {
				id: randomUUID(),
				companyId: params.companyId,
				jobId: params.jobId,
				jobAppliedId: board.jobAppliedId,
				userId: board.userId,
				candidateId: params.candidateId,
				stage: params.stage,
				message,
				reasonCode: null,
				nextStep,
				source: 'recruiter',
				sentBy: params.actorId,
				sentByName: params.actorName,
				sentAt: new Date().toISOString(),
			}
			await repo.create(feedback)

			if (board.email) {
				try {
					const [company, job, user] = await Promise.all([
						infra.companyRepository.getCompany(params.companyId) as Promise<Company | null>,
						infra.jobRepository.getJob(params.companyId, params.jobId) as Promise<PostJob | null>,
						Promise.resolve(infra.userRepository.getUser(board.userId)).catch(() => null) as Promise<UsersCompany | null>,
					])
					const rendered = renderProcessFeedbackEmail({
						branding: await branding.forCompanyId(params.companyId),
						candidateName: board.name ?? user?.display_name ?? null,
						companyName: company?.companyName ?? null,
						jobName: job?.jobName ?? board.jobName,
						message,
						nextStep,
						viewUrl: env.CANDIDATE_APP_URL ? `${env.CANDIDATE_APP_URL.replace(/\/$/, '')}/interviews` : null,
						language:
							board.language ?? ((user as unknown as Record<string, unknown> | null)?.language as string | undefined) ?? job?.language ?? 'pt-BR',
					})
					await emailClient.sendEmail({
						from: FROM_EMAIL,
						to: board.email,
						subject: rendered.subject,
						htmlBody: rendered.htmlBody,
						textBody: rendered.textBody,
						tag: 'process-feedback',
					})
				} catch (error) {
					console.warn('[feedback] e-mail do retorno falhou:', (error as Error).message)
				}
			}
			return feedback
		},

		/**
		 * A reprovação com retorno (o e-mail do anti-ghosting já saiu) também
		 * fica no protocolo, para o agente do talento ler. Nunca derruba a
		 * reprovação: quem chama ignora a falha.
		 */
		async recordFromRejection(params: {
			companyId: string
			jobId: string
			candidateId: string
			interview: Record<string, unknown>
			message: string
			rejectionReasonCode: string | null
			actorId: string | null
			actorName: string | null
		}): Promise<void> {
			try {
				const userId = refId(params.interview.user_ref)
				const jobAppliedId = refId(params.interview.job_applied_ref)
				const message = params.message.trim()
				if (!userId || !jobAppliedId || !message) return
				await repo.create({
					id: randomUUID(),
					companyId: params.companyId,
					jobId: params.jobId,
					jobAppliedId,
					userId,
					candidateId: params.candidateId,
					stage: processStageFromRejection(params.rejectionReasonCode),
					message: message.slice(0, 4000),
					reasonCode: processReasonFromRejection(params.rejectionReasonCode),
					nextStep: null,
					source: 'rejection',
					sentBy: params.actorId,
					sentByName: params.actorName,
					sentAt: new Date().toISOString(),
				})
			} catch (error) {
				console.warn('[feedback] registro da reprovação falhou:', (error as Error).message)
			}
		},
	}
}
