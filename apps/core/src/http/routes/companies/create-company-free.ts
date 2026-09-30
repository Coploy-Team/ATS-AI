import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { COMPANY_FREE_DEFAULTS } from '@/http/constants/company-free-constants'
import {
	createCompanyFreeService,
	rollbackCreation,
} from '@/lib/services/company-free-service'
import {
	createCompanyFreeBodySchema,
	createCompanyFreeResponseSchema,
} from '@/schemas/company-free-schema'
import type { Company } from '@coploy/domain'
import type { AuthCreatedUser } from '@/types/company-free'
import { BadRequestError } from '@coploy/shared/errors'

export function createCompanyFree(app: FastifyInstance) {
	const { createCompanyAndUser } = createCompanyFreeService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/companies/free',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['companies'],
				summary: 'Create a new company and user (free plan)',
				body: createCompanyFreeBodySchema,
				response: {
					201: createCompanyFreeResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { user: userData, company: companyData } = request.body

			let createdUser: AuthCreatedUser | null = null
			let companyDoc: (Company & { id: string }) | null = null

			try {
				const result = await createCompanyAndUser(userData, companyData)
				createdUser = result.user
				companyDoc = result.company

				return reply.status(201).send({
					company: {
						id: companyDoc.id,
						companLogo: companyDoc.companLogo || '',
						companySize: companyDoc.companySize || '',
						segment: companyDoc.segment || null,
						companyCity: companyDoc.companyCity || '',
						companyWebsite: companyDoc.companyWebsite || '',
						subscriptionPlan: COMPANY_FREE_DEFAULTS.PLAN,
					},
					user: {
						id: createdUser.uid,
						email: userData.email,
						display_name: userData.fullName,
						is_owner: true,
					},
				})
			} catch (error) {
				// A causa real nunca chega ao cliente (só a mensagem genérica),
				// então sem este log o defeito é indiagnosticável em produção.
				console.error(
					'[createCompanyFree] Failed:',
					error instanceof Error ? (error.stack ?? error.message) : error,
				)

				await rollbackCreation(companyDoc, createdUser)

				if (error instanceof BadRequestError || (error instanceof Error && error.name === 'BadRequestError')) {
					throw error
				}

				throw new BadRequestError('Erro ao criar empresa e usuário')
			}
		},
	)
}
