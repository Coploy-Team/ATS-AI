import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import {
	JobPortalSchema,
	type JobPortal as JobPortalType,
} from '@/schemas/job-portal-schema'
import type { JobPortal } from '@/types/job-portal'
import type { Company } from '@coploy/domain'
import { NotFoundError } from '@coploy/shared/errors'
import { createJobPortalService } from '@/lib/services/job-portal-service'

export function getJobPortal(app: FastifyInstance) {
	const jobPortalService = createJobPortalService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/job-portal',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-portal'],
					security: [{ bearerAuth: [] }],
					summary: 'Get job portal',
					response: {
						200: z.object({
							jobPortal: JobPortalSchema,
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()

				// resolve pelo ref (GCP) OU pelo company_id do portal (selfhosted,
				// onde o ref não existe — antes era 404 eterno na distribuição open)
				const jobPortal = await jobPortalService.resolvePortal(
					company as Company & { id: string },
				) as JobPortal | null
				if (!jobPortal) {
					throw new NotFoundError('Company does not have a job portal')
				}

				const jobPortalData: JobPortalType = {
					id: jobPortal.id,
					bannerUrl: jobPortal.bannerUrl,
					company:
						typeof jobPortal.company === 'string'
							? jobPortal.company
							: ((jobPortal.company as { id?: string })?.id ??
								(jobPortal as { company_id?: string }).company_id ??
								''),
					defaultDomainUrl: jobPortal?.defaultDomainUrl,
					isProfileVisible: jobPortal?.isProfileVisible,
					logoUrl: jobPortal?.logoUrl,
					primaryColor: jobPortal?.primaryColor,
					textColor: jobPortal?.textColor,
					// o gotcha da allowlist manual: os dois foram gravados pelo PUT e
					// nunca voltavam no GET — o form abria vazio e o recorte do banner
					// resetava (relato do teste da open)
					bannerPosition:
						(jobPortal as { bannerPosition?: number | null }).bannerPosition ?? null,
					socialLinks:
						(jobPortal as { socialLinks?: JobPortalType['socialLinks'] }).socialLinks ?? null,
					about: (jobPortal as { about?: string | null }).about ?? null,
					videoUrl: (jobPortal as { videoUrl?: string | null }).videoUrl ?? null,
				}

				return {
					jobPortal: jobPortalData,
				}
			},
		)
}
