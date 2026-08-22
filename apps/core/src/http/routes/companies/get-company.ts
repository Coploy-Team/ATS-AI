import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createCompanyService } from '@/lib/services/company-service'
import { CompaniesSchema } from '@/schemas/companies-schema'

const responseSchema = z.object({
	company: CompaniesSchema,
})

type ResponseShape = z.infer<typeof responseSchema>

export function getCompany(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Get details from company',
					response: { 200: responseSchema },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const result = await companyService.getCompany(company.id)
				return reply.send({ company: result } as unknown as ResponseShape)
			},
		)
		.get(
			'/companies/membership',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Get current user company (membership)',
					response: { 200: responseSchema },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const result = await companyService.getCompany(company.id)
				return reply.send({ company: result } as unknown as ResponseShape)
			},
		)
}
