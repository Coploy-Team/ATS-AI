import { EMAIL_TEMPLATE_KINDS, renderTemplate } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import {
	applicationAckPreviewData,
	renderApplicationAckEmail,
} from '@/emails/application-ack'
import {
	interviewInvitePreviewData,
	renderInterviewInviteEmail,
} from '@/emails/interview-invite'
import {
	profileRequestPreviewData,
	renderProfileRequestEmail,
} from '@/emails/profile-request'
import {
	rejectionFeedbackPreviewData,
	renderRejectionFeedbackEmail,
} from '@/emails/rejection-feedback'
import { createAuth } from '@/http/routes/middlewares/auth'

/**
 * Como o e-mail fica, de verdade.
 *
 * A tela de templates pedia para o cliente escrever às cegas: ele digitava um
 * texto e só descobria o resultado quando um candidato real recebia. Imitar o
 * layout em CSS no front resolveria a ansiedade e criaria um problema maior —
 * duas versões do mesmo e-mail, divergindo a cada ajuste, e a versão bonita
 * seria a falsa.
 *
 * Então a prévia usa os MESMOS renderizadores que enviam. O que aparece na tela
 * é literalmente o HTML que sai no Postmark, com dados de exemplo no lugar das
 * variáveis.
 */
const PREVIEW_KINDS = EMAIL_TEMPLATE_KINDS

export function emailTemplatePreview(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/email-templates/:kind/preview',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Render an email exactly as the candidate will receive it',
					description:
						'Usa os mesmos renderizadores do envio real. Assunto e corpo vêm do rascunho ' +
						'da tela — não precisam estar salvos, o que permite prever antes de gravar.',
					params: z.object({ kind: z.enum(PREVIEW_KINDS) }),
					body: z.object({
						subject: z.string().max(200).optional(),
						body: z.string().max(8000).optional(),
					}),
					response: {
						200: z.object({
							subject: z.string(),
							html: z.string(),
							/** Nomes usados no exemplo, para a tela poder dizer que são fictícios. */
							sample: z.object({
								candidato: z.string(),
								vaga: z.string(),
								empresa: z.string(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { kind } = request.params

				/*
				 * Nome real da empresa no exemplo: ver a própria marca no lugar de
				 * "Coploy" é o que faz o cliente reconhecer que o e-mail sai no nome
				 * dele. Candidato e vaga seguem fictícios — não há um caso real ali.
				 */
				const empresa =
					(company.companyName as string | undefined) ||
					interviewInvitePreviewData.companyName ||
					'Coploy'
				const values = {
					candidato: interviewInvitePreviewData.candidateName ?? 'Ana Silva',
					vaga: interviewInvitePreviewData.jobName ?? 'Engenheira de Software',
					empresa,
					link: interviewInvitePreviewData.interviewUrl,
				}

				const draftBody = request.body.body?.trim()
					? renderTemplate(request.body.body, values)
					: null

				const rendered = (() => {
					if (kind === 'interview_invite') {
						return renderInterviewInviteEmail({
							...interviewInvitePreviewData,
							companyName: empresa,
							message: draftBody,
						})
					}
					if (kind === 'rejection_feedback') {
						return renderRejectionFeedbackEmail({
							...rejectionFeedbackPreviewData,
							companyName: empresa,
							/*
							 * No retorno de reprovação o corpo continua sendo o que o
							 * recrutador escreve em cada caso — aqui só ilustramos com o
							 * texto de exemplo, para o cliente ver onde ele entra.
							 */
							message: draftBody ?? rejectionFeedbackPreviewData.message,
						})
					}
					if (kind === 'application_ack') {
						return renderApplicationAckEmail({
							...applicationAckPreviewData,
							companyName: empresa,
						})
					}
					return renderProfileRequestEmail({
						...profileRequestPreviewData,
						companyName: empresa,
						message: draftBody,
					})
				})()

				const draftSubject = request.body.subject?.trim()
				return {
					subject: draftSubject ? renderTemplate(draftSubject, values) : rendered.subject,
					html: rendered.htmlBody,
					sample: { candidato: values.candidato, vaga: values.vaga, empresa },
				}
			},
		)
}
