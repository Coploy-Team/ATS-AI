import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Company, PostJob } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { createCompanyService } from '@/lib/services/company-service'
import { createJobsService } from '@/lib/services/jobs-service'

export function getInterview(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	const jobsService = createJobsService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().get(
		'/public/interview',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['public'],
				summary: 'Get interview data for public access',
				description:
					'Retrieve company and job information for interview display without authentication',
				querystring: z.object({
					companyId: z.string().describe('ID da empresa'),
					postJobId: z.string().describe('ID da vaga de trabalho'),
				}),
				response: {
					200: z.object({
						companyName: z.string(),
						companLogo: z.string(),
						jobName: z.string(),
						language: z.string(),
						typeInterview: z.string(),
					}),
					400: z.object({
						message: z.string(),
					}),
					404: z.object({
						message: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			try {
				const { companyId, postJobId } = request.query

				// Buscar dados da empresa
				let company: Company | null = null
				try {
					company = (await companyService.getCompany(companyId)) as Company
				} catch {
					return reply.status(404).send({
						message: 'Empresa não encontrada',
					})
				}

				// Buscar dados da vaga usando getSubDocument
				const postJob = await jobsService.getJob(
					companyId,
					postJobId,
				) as PostJob | null
				if (!postJob) {
					return reply.status(404).send({
						message: 'Vaga não encontrada',
					})
				}

				return reply.status(200).send({
					companyName: company.companyName ?? '',
					companLogo: company.companLogo ?? '',
					jobName: postJob.jobName ?? '',
					language: postJob.language ?? '',
					typeInterview: postJob.typeInterview ?? '',
				})
			} catch (error) {
				throw new BadRequestError(error as string)
			}
		},
	)
}
