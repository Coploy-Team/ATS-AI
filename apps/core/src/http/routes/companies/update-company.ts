import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCompanyService } from '@/lib/services/company-service'
import type { UpdateInput, Company } from '@coploy/domain'
import { CompaniesSchema } from '@/schemas/companies-schema'

const updateCompanyBodySchema = CompaniesSchema.omit({
	id: true,
	companLogo: true,
})

const responseSchema = z.object({ company: CompaniesSchema })
type ResponseShape = z.infer<typeof responseSchema>

export function updateCompany(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Update a company',
					description: 'Update specific fields of a company',
					body: updateCompanyBodySchema,
					response: {
						200: responseSchema,
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const companyData = company as unknown as Company
				const result = await companyService.updateCompany(
					company.id,
					request.body as unknown as UpdateInput<Company>,
					companyData.companLogo ?? undefined,
				)
				return reply.send({ company: result } as unknown as ResponseShape)
			},
		)
}
