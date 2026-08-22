import { createCompanyService } from '@/lib/services/company-service'
import { CompaniesSchema } from '@/schemas/companies-schema'
import type { Company, UpdateInput } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

const createCompanyBodySchema = CompaniesSchema.omit({
	id: true,
	companLogo: true,
})

export function createCompany(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/companies',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['companies'],
				security: [{ bearerAuth: [] }],
				summary: 'Create a new company',
				body: createCompanyBodySchema,
				response: {
					201: z.object({
						company: CompaniesSchema,
					}),
				},
			},
		},
		async (request, reply) => {
			const company = await companyService.createCompany(request.body as unknown as UpdateInput<Company>)
			return reply.status(201).send({ company } as unknown as { company: z.infer<typeof CompaniesSchema> })
		},
	)
}
