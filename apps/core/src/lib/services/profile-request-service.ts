import type { Company, PostJob, UsersCompany } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { renderProfileRequestEmail } from '@/emails/profile-request'
import {
	createEmailTemplateResolver,
	withCustomSubject,
} from '@/lib/services/email-template-resolver'
import { env } from '@/env'
import { PostmarkClient } from '@/lib/postmark-client'

const FROM_EMAIL = 'no-reply@coploy.io'

export type ProfileRequestEmailClient = EmailSender

export interface RequestProfileInput {
	companyId: string
	jobId: string
	/** Id do candidato no board (mesma chave do dossiê). */
	candidateId: string
	/** Recado do recrutador, antes dos caminhos. */
	message?: string
}

export interface RequestProfileResult {
	status: 'sent' | 'no_email'
	/** Campos que o e-mail pediu, para a tela confirmar o que foi solicitado. */
	requested: string[]
}

/** Rótulos que o candidato entende — `missingFields` vem em chave técnica. */
const FIELD_LABELS: Record<string, { pt: string; en: string }> = {
	occupation: { pt: 'Cargo atual', en: 'Current role' },
	level: { pt: 'Nível de senioridade', en: 'Seniority level' },
	headline: { pt: 'Título do perfil', en: 'Profile headline' },
	summary: { pt: 'Resumo', en: 'Summary' },
	skills: { pt: 'Habilidades', en: 'Skills' },
	experiences: { pt: 'Experiências', en: 'Experience' },
	education: { pt: 'Formação', en: 'Education' },
	languages: { pt: 'Idiomas', en: 'Languages' },
	certifications: { pt: 'Certificações', en: 'Certifications' },
	yearsOfExperience: { pt: 'Tempo de experiência', en: 'Years of experience' },
	resumeUrl: { pt: 'Currículo em PDF', en: 'Résumé PDF' },
	linkedinUrl: { pt: 'LinkedIn', en: 'LinkedIn' },
}

function label(field: string, language: string): string {
	const entry = FIELD_LABELS[field]
	if (!entry) return field
	return language.toLowerCase().startsWith('en') ? entry.en : entry.pt
}

/**
 * Pedido de cadastro de perfil.
 *
 * A tela do candidato mostra a trajetória vazia e o recrutador não tinha o que
 * fazer com essa informação — via o buraco e seguia. Isto fecha o ciclo: um
 * e-mail que explica O QUE falta e oferece os dois caminhos (assistente e área
 * do candidato).
 *
 * Sem e-mail não há erro: a resposta diz `no_email` e a tela mostra o motivo,
 * em vez de estourar uma exceção por um dado que a empresa não controla.
 */
export function createProfileRequestService(
	infra: InfraProvider,
	emailClient: ProfileRequestEmailClient = createEmailSender(infra),
) {
	const templates = createEmailTemplateResolver(infra)

	return {
		async requestProfile(input: RequestProfileInput): Promise<RequestProfileResult> {
			const { companyId, jobId, candidateId, message } = input

			const interview = (await infra.candidateRepository.getJobInterview(
				companyId,
				jobId,
				candidateId,
			)) as Record<string, unknown> | null
			if (!interview) throw new NotFoundError('Candidate not found in this job')

			const userId = (interview.user_ref as { path?: string } | undefined)?.path
				?.split('/')
				.pop()
			if (!userId) throw new BadRequestError('Candidato sem usuário vinculado')

			const [company, job, user, profile] = await Promise.all([
				infra.companyRepository.getCompany(companyId) as Promise<Company | null>,
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
				infra.userRepository.getUser(userId).catch(() => null) as Promise<UsersCompany | null>,
				infra.userRepository.getCandidateProfile(userId).catch(() => null),
			])

			const email = ((interview.email as string) ?? user?.email ?? '').trim()
			// `language` existe no doc do Firestore mas não no tipo de domínio
			const language =
				((user as unknown as Record<string, unknown> | null)?.language as string) ??
				job?.language ??
				'pt-BR'

			/*
			 * `missingFields` já vem ordenado por impacto do candidate-profile
			 * service. Cortar em 5 é deliberado: uma lista de 12 itens num e-mail
			 * é a mesma coisa que o formulário longo que faz a pessoa desistir.
			 */
			const missingFields = Array.isArray((profile as { missingFields?: string[] })?.missingFields)
				? ((profile as { missingFields?: string[] }).missingFields ?? [])
				: []
			const requested = missingFields.slice(0, 5).map((field) => label(field, language))

			if (!email) return { status: 'no_email', requested }

			const custom = await templates.resolve(companyId, 'profile_request', {
				candidato: (interview.name as string) ?? user?.display_name,
				vaga: job?.jobName,
				empresa: company?.companyName,
				link: env.CANDIDATE_APP_URL,
			})

			// mensagem digitada agora vence o texto padrão configurado meses atrás
			const rendered = withCustomSubject(
				renderProfileRequestEmail({
					candidateName: (interview.name as string) ?? user?.display_name ?? null,
					companyName: company?.companyName ?? null,
					jobName: job?.jobName ?? null,
					profileUrl: env.CANDIDATE_APP_URL,
					message: message?.trim() || custom.body,
					language,
					missing: requested,
				}),
				custom.subject,
			)

			await emailClient.sendEmail({
				from: FROM_EMAIL,
				to: email,
				subject: rendered.subject,
				htmlBody: rendered.htmlBody,
				textBody: rendered.textBody,
				tag: 'profile-request',
			})

			return { status: 'sent', requested }
		},
	}
}
