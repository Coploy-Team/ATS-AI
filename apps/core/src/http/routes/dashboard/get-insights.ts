import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createInsightsService } from '@/lib/services/insights-service'
import {
	insightsBodySchema,
	insightsResponseSchema,
} from '@/schemas/insights-schema'
import type { SupportedLanguage } from '@/http/constants/insights-constants'
import type { Company } from '@coploy/domain'

export function getInsights(app: FastifyInstance) {
	const { processInsights } = createInsightsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/insights',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Gera insights baseados em dados de entrevistas',
					description:
						'Retorna um insight acionável baseado nos dados de entrevistas. O insight é gerado para todos os idiomas suportados uma vez por dia.',
					body: insightsBodySchema,
					response: {
						200: insightsResponseSchema,
					},
				},
			},
			async (request) => {
				try {
					const userMembership = await request.getUserMembership()
					const companyId = (
						userMembership.company as Company & { id: string }
					).id
					let { language } = request.body
					const { force } = request.body
					// Normalizar códigos curtos do i18n para o formato esperado
					const langMap: Record<string, string> = {
						en: 'en-US',
						pt: 'pt-BR',
						es: 'es-ES',
						fr: 'fr-FR',
						it: 'it-IT',
					}
					language = (langMap[language] ?? language) as SupportedLanguage

					// Process insights using the service
					return await processInsights(
						{
							companyId,
							language,
							authorization: request.headers.authorization as string,
							force,
						},
						app,
					)
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
