import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HTTP_STATUS } from '@/http/constants'
import { createAuth } from '@/http/routes/middlewares/auth'
import {
	JobPortalSchema,
	type JobPortal as JobPortalType,
} from '@/schemas/job-portal-schema'
import type { JobPortal } from '@/types/job-portal'
import { BadRequestError } from '@coploy/shared/errors'
import type { Company } from '@coploy/domain'
import { createJobPortalService } from '@/lib/services/job-portal-service'

export function updateJobPortal(app: FastifyInstance) {
	const jobPortalService = createJobPortalService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/job-portal',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-portal'],
					security: [{ bearerAuth: [] }],
					summary: 'Update job portal',
					body: z.object({
						isProfileVisible: z.boolean().optional(),
						primaryColor: z.string().optional(),
						textColor: z.string().optional(),
						/** Fatia vertical do banner exibida na faixa (0 = topo, 100 = base). */
						bannerPosition: z.number().int().min(0).max(100).optional(),
						/** Links da empresa fora do portal. String vazia limpa o link. */
						socialLinks: z
							.object({
								website: z.string().url().or(z.literal('')).optional(),
								linkedin: z.string().url().or(z.literal('')).optional(),
								instagram: z.string().url().or(z.literal('')).optional(),
								facebook: z.string().url().or(z.literal('')).optional(),
								glassdoor: z.string().url().or(z.literal('')).optional(),
							})
							.optional(),
						/** "Sobre a empresa" (Markdown). String vazia limpa. */
						about: z.string().optional(),
						/** Vídeo institucional; só YouTube/Vimeo viram embed no portal. */
						videoUrl: z.string().url().or(z.literal('')).optional(),
					}),
					response: {
						200: z.object({
							jobPortal: JobPortalSchema,
						}),
						404: z.object({
							message: z.string(),
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const { company: _company } = await request.getUserMembership()
				const company = _company as Company & { id: string }
				const updateData = request.body

				/*
				 * UPSERT de branding: salvar uma cor é a PRIMEIRA ação de quem
				 * configura o portal — exigir portal pré-existente devolvia 404
				 * eterno na distribuição open (o POST que cria é o do SaaS, acoplado
				 * a domínio custom no Firebase Hosting; branding não depende disso).
				 */
				const existingJobPortal = (await jobPortalService.ensurePortal(
					company,
				)) as JobPortal & { id: string }

				// Atualizar apenas os campos fornecidos
				await jobPortalService.updateJobPortal(existingJobPortal.id, updateData)

				// Retornar o documento atualizado
				const updatedJobPortal = await jobPortalService.getJobPortal(
					existingJobPortal.id,
				) as JobPortal | null
				if (!updatedJobPortal) {
					throw new BadRequestError('Failed to retrieve updated job portal')
				}

				// GCP guarda ref `company`; selfhosted guarda `company_id` plano
				const companyRef = updatedJobPortal.company as { id?: string } | string | undefined
				const jobPortalData: JobPortalType = {
					...updatedJobPortal,
					company:
						typeof companyRef === 'string'
							? companyRef
							: (companyRef?.id ??
								(updatedJobPortal as { company_id?: string }).company_id ??
								company.id),
				}

				return {
					jobPortal: jobPortalData,
				}
			},
		)
}
