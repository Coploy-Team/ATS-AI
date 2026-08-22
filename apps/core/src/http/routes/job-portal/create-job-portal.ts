import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import {
	FirebaseHostingErrorMessages,
	type FirebaseHostingErrorResponse,
} from '@/http/models/firebase-hosting'
import { createAuth } from '@/http/routes/middlewares/auth'
import { addCNAMERecord } from '@/lib/aws-create-hosted'
import { getAccessToken } from '@/lib/google/google-apis-token'
import { type JobPortal, JobPortalSchema } from '@/schemas/job-portal-schema'
import { BadRequestError } from '@coploy/shared/errors'
import { createJobPortalService } from '@/lib/services/job-portal-service'

export function createJobPortal(app: FastifyInstance) {
	const jobPortalService = createJobPortalService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/job-portal',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-portal'],
					security: [{ bearerAuth: [] }],
					summary: 'Create new job portal',
					body: z.object({
						company: z.string(),
						defaultDomainUrl: z.string(),
						isProfileVisible: z.boolean(),
						primaryColor: z.string(),
						textColor: z.string(),
					}),
					response: {
						201: z.object({
							jobPortal: JobPortalSchema,
						}),
						400: z.object({
							error: z.object({
								code: z.number(),
								message: z.string(),
								errors: z.string(),
							}),
						}),
						500: z.object({
							error: z.object({
								code: z.number(),
								message: z.string(),
								errors: z.string(),
							}),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const data = request.body

				if (company.jobPortal) {
					throw new BadRequestError('Company already has a job portal')
				}

				const subdomain = `${data.defaultDomainUrl}.coploy.io`
				const target = `painel-vagas.web.app`

				// PRIMEIRO: Criar custom domain no Firebase Hosting
				try {
					const accessToken = await getAccessToken()

					await axios.post(
						`${env.FIREBASE_HOSTING_URL}/painel-vagas/customDomains?customDomainId=${subdomain}`,
						{}, // Body vazio conforme implementação de referência
						{
							headers: {
								Authorization: `Bearer ${accessToken}`,
							},
						},
					)
				} catch (error) {
					if (axios.isAxiosError(error) && error.response) {
						const firebaseError = error.response
							.data as FirebaseHostingErrorResponse

						const message =
							FirebaseHostingErrorMessages[
								firebaseError.error
									.status as keyof typeof FirebaseHostingErrorMessages
							] || 'Ocorreu um erro inesperado ao criar o domínio.'

						return reply.status(400).send({
							error: {
								code: firebaseError.error.code,
								message,
								errors: firebaseError.error.message,
							},
						})
					}

					return reply.status(500).send({
						error: {
							code: 500,
							message: 'Internal Server Error',
							errors: 'Failed to create custom domain on Firebase Hosting',
						},
					})
				}

				// Se chegou aqui, Firebase Hosting deu certo - criar Job Portal
				const jobPortal = (await jobPortalService.createJobPortal(
					{
						...data,
						defaultDomainUrl: subdomain,
						bannerUrl: '',
						logoUrl: '',
						company_id: company.id,
					},
					data.defaultDomainUrl,
				)) as JobPortal

				await jobPortalService.updateCompany(company.id, {
					jobPortal: { id: jobPortal.id },
				})

				// Por último: Criar CNAME record no DNS
				try {
					await addCNAMERecord(subdomain, target)
				} catch (error) {
					reply.status(400).send({
						error: {
							code: 400,
							message: 'Bad Request',
							errors: String(error),
						},
					})
				}

				return {
					jobPortal,
				}
			},
		)
}
