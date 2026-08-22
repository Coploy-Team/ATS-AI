import type { EmailSender } from '@/lib/email-sender'
import { PostmarkClient } from '@/lib/postmark-client'
import { renderRejectionFeedbackEmail } from '@/emails/rejection-feedback'
import { BadRequestError } from '@coploy/shared/errors'
import { validateCandidateFeedbackOrThrow } from '@/lib/services/feedback-guardrails'
import { env } from '@/env'
import type { ResolvedTemplate, TemplateValues } from '@/lib/services/email-template-resolver'
import { withCustomSubject } from '@/lib/services/email-template-resolver'

type EmailTemplateResolve = (
	companyId: string,
	kind: 'rejection_feedback',
	values: TemplateValues,
) => Promise<ResolvedTemplate>

const REJECTION_FEEDBACK_FROM_EMAIL = 'no-reply@coploy.io'

export type RejectionFeedbackEmailClient = EmailSender

export type RejectionFeedbackCandidate = {
	email?: string | null
	name?: string | null
}

export type SendRejectionFeedbackParams = {
	candidate: RejectionFeedbackCandidate
	message: string
	jobName?: string | null
	companyName?: string | null
	companyId?: string | null
	jobId?: string | null
	jobAppliedId?: string | null
	language?: string | null
	rejectionDecisionSource?: string | null
}

function buildReviewUrl(params: SendRejectionFeedbackParams): string | null {
	if (params.rejectionDecisionSource !== 'knockout') return null
	if (!params.companyId || !params.jobId || !params.jobAppliedId) return null

	const baseUrl = env.INTERVIEW_BASE_URL.replace(/\/+$/, '')
	return `${baseUrl}/careers/${encodeURIComponent(params.companyId)}/jobs/${encodeURIComponent(params.jobId)}/applications/${encodeURIComponent(params.jobAppliedId)}/revisao`
}

export function createRejectionFeedbackEmailSender(
	emailClient: RejectionFeedbackEmailClient = new PostmarkClient(),
	/*
	 * Resolver opcional: quem constrói o sender sem infra (previews, testes)
	 * continua funcionando com a cópia padrão. Só o caminho real de reprovação
	 * passa o resolver.
	 */
	templates?: { resolve: EmailTemplateResolve },
) {
	return {
		async send(params: SendRejectionFeedbackParams) {
			const candidateEmail = params.candidate.email?.trim()
			if (!candidateEmail) {
				throw new BadRequestError('Candidate email is required to send rejection feedback')
			}

			const message = params.message.trim()
			if (!message) {
				throw new BadRequestError('rejectionFeedbackMessage is required when rejecting a candidate')
			}
			const guardrails = validateCandidateFeedbackOrThrow(message)

			/*
			 * Aqui o template só troca o ASSUNTO. O corpo é o que o recrutador
			 * escreveu agora, sobre esta pessoa — sobrescrevê-lo com um texto
			 * genérico da empresa apagaria o retorno específico, que é exatamente
			 * o que o anti-ghosting existe para garantir.
			 */
			const custom =
				templates && params.companyId
					? await templates.resolve(params.companyId, 'rejection_feedback', {
							candidato: params.candidate.name,
							vaga: params.jobName,
							empresa: params.companyName,
						})
					: { subject: null, body: null }

			const rendered = withCustomSubject(
				renderRejectionFeedbackEmail({
					candidateName: params.candidate.name || '',
					jobName: params.jobName || '',
					companyName: params.companyName || '',
					message,
					reviewUrl: buildReviewUrl(params),
					language: params.language,
				}),
				custom.subject,
			)

			const response = await emailClient.sendEmail({
				from: REJECTION_FEEDBACK_FROM_EMAIL,
				to: candidateEmail,
				subject: rendered.subject,
				htmlBody: rendered.htmlBody,
				textBody: rendered.textBody,
				tag: 'rejection-feedback',
			})

			return {
				sentAt: new Date(),
				messageId: response.MessageID,
				riskFlags: guardrails.riskFlags,
			}
		},
	}
}
