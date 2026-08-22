import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

import type { InfoJobs } from '@/types/info-jobs'

export function getInfoJobs(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/info-jobs',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get all info jobs with pagination',
					querystring: z.object({
						page: z.string().default('1').transform(Number),
						limit: z.string().default('10').transform(Number),
						find: z.string().optional(),
					}),
					response: {
						200: z.object({
							infoJobs: z.array(z.record(z.string(), z.unknown())),
							pagination: z.object({
								total: z.number(),
								page: z.number(),
								totalPages: z.number(),
								hasMore: z.boolean(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { page, limit, find } = request.query

				// Buscar info jobs com paginação
				const allInfoJobs = await jobsService.listInfoJobs(company.id)
				const infoJobs = [...allInfoJobs].sort((a, b) =>
					String(a.name ?? '').localeCompare(String(b.name ?? '')),
				) as unknown as InfoJobs[]

				// Filtrar por nome se houver termo de busca
				const filteredInfoJobs = find
					? infoJobs.filter((infoJob) =>
							infoJob.name.toLowerCase().includes(find.toLowerCase()),
						)
					: infoJobs

				// Processar os resultados
				const processedInfoJobs = filteredInfoJobs.map((infoJob) => ({
					...infoJob,
					welcomeText: infoJob.welcomeText,
					welcomeVideo: infoJob.welcomeVideo,
				}))

				const total = processedInfoJobs.length
				const totalPages = Math.ceil(total / limit)

				// Aplicar paginação
				const startIndex = (page - 1) * limit
				const paginatedInfoJobs = processedInfoJobs.slice(
					startIndex,
					startIndex + limit,
				)

				return {
					infoJobs: paginatedInfoJobs,
					pagination: {
						total,
						page,
						totalPages,
						hasMore: page < totalPages,
					},
				}
			},
		)
}
