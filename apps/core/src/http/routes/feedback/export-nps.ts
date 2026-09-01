import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import type { Nps } from '@coploy/domain'
import { createFeedbackService } from '@/lib/services/feedback-service'

export function exportNps(app: FastifyInstance) {
	const feedbackService = createFeedbackService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/feedback/nps/export',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['feedback'],
					security: [{ bearerAuth: [] }],
					summary: 'Export NPS data in CSV format',
					description:
						'Export all NPS (Net Promoter Score) data for the authenticated company in CSV format compatible with Excel',
					response: {
						200: z.string(),
						400: z.object({
							message: z.string(),
						}),
						401: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				try {
					const userMembership = await request.getUserMembership()
					const companyId = userMembership.company.id

					// Search for all NPS data for the company
					const allNps = (await feedbackService.listNps(companyId, {
						orderByField: 'createdAt',
						orderDirection: 'desc',
					})) as Nps[]

					if (allNps.length === 0) {
						reply.header('Content-Type', 'text/csv; charset=utf-8')
						reply.header(
							'Content-Disposition',
							`attachment; filename="nps-export-${new Date().toISOString().split('T')[0]}.csv"`,
						)
						return reply.send(
							'createdAt,candidateName,candidateEmail,interviewType,jobName,companyName,score,comment\n',
						)
					}

					// Criar cabeçalho do CSV
					const csvHeaders = [
						'createdAt',
						'candidateName',
						'candidateEmail',
						'interviewType',
						'jobName',
						'companyName',
						'score',
						'comment',
					]

					// Criar linhas de dados
					const csvRows = allNps.map((nps) => {
						let createdAt: string
						const createdAtRaw = nps.createdAt as unknown
						if (createdAtRaw instanceof Date) {
							createdAt = createdAtRaw.toISOString()
						} else if (
							createdAtRaw &&
							typeof createdAtRaw === 'object' &&
							'seconds' in createdAtRaw
						) {
							// Timestamp do Firestore
							createdAt = new Date((createdAtRaw as { seconds: number }).seconds * 1000).toISOString()
						} else {
							createdAt = new Date().toISOString()
						}

						return [
							createdAt,
							nps.candidateName || '',
							nps.candidateEmail || '',
							nps.interviewType || '',
							nps.jobName || '',
							userMembership.company.companyName || '',
							nps.score?.toString() || '',
							nps.comment || '',
						]
					})

					// Combinar cabeçalho e dados
					const csvContent = [
						csvHeaders.join(','),
						...csvRows.map((row) => row.map((field) => `"${field}"`).join(',')),
					].join('\n')

					// Configurar headers para download
					reply.header('Content-Type', 'text/csv; charset=utf-8')
					reply.header(
						'Content-Disposition',
						`attachment; filename="nps-export-${new Date().toISOString().split('T')[0]}.csv"`,
					)

					// Enviar diretamente o conteúdo CSV como string
					return reply.send(csvContent)
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
