import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCompanyService } from '@/lib/services/company-service'
import type { UpdateInput, Company } from '@coploy/domain'
import { CompaniesSchema } from '@/schemas/companies-schema'

/*
 * O logo entra aqui como URL.
 *
 * Ele era omitido porque existe uma rota dedicada multipart (`POST
 * /companies/logo`) — só que o contrato público não descreve corpo multipart,
 * então o SDK gera aquela mutation com payload `void` e o ATS ficou sem como
 * chamá-la: a tela de configuração dizia "em breve" havia semanas.
 *
 * O caminho que já funciona no avatar do perfil é `POST /upload/file` (devolve
 * a URL pronta) seguido do PATCH da entidade. Reusar isso é uma peça a menos e
 * a mesma exposição que `photoUrl` do perfil já tem.
 */
const patchCompanyBodySchema = CompaniesSchema.omit({
	id: true,
}).partial()

const responseSchema = z.object({ company: CompaniesSchema })
type ResponseShape = z.infer<typeof responseSchema>

export function patchCompany(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Partially update a company',
					description: 'Update specific fields of a company',
					body: patchCompanyBodySchema,
					response: {
						200: responseSchema,
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const result = await companyService.patchCompany(
					company.id,
					request.body as unknown as UpdateInput<Company>,
				)
				return reply.send({ company: result } as unknown as ResponseShape)
			},
		)
}
