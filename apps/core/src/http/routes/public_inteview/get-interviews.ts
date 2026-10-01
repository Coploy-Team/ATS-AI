import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createPublicInterviewsService } from '@/lib/services/public-interviews-service'
import {
	publicInterviewsQuerySchema,
	publicInterviewsResponseSchema,
} from '@/schemas/public-interviews-schema'

export function getInterviews(app: FastifyInstance) {
	const { processPublicInterviews } = createPublicInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/public_interviews',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['public_interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Get all public interviews with pagination and filters',
					description:
						'Get public interviews with pagination and filters based on various criteria',
					querystring: publicInterviewsQuerySchema,
					response: {
						200: publicInterviewsResponseSchema,
					},
				},
			},
			async (request) => {
				const {
					cursor,
					limit,
					find,
					careerLevel,
					country,
					state,
					city,
					startDate,
					endDate,
					hardSkillTag,
					hardSkillArea,
					minHardSkillPontuacao,
					hardSkillNivelEvidencia,
					senioridadeNivel,
					minConfiancaSenioridade,
					tipoEmpresaIdeal,
					porteEmpresa,
					minScoreGeral,
					minYearsExperience,
					unlockedOnly,
				} = request.query

				// Buscar dados da empresa do usuário logado para aplicar filtros de país
				// e cruzar com creditsUsed (badge "desbloqueado" + filtro unlockedOnly).
				let headquartersCountries: string[] | null = null
				let evaluateInternationalCandidates: boolean | undefined = undefined
				let companyId: string | undefined = undefined

				try {
					const membership = await request.getUserMembership()
					const company = membership.company
					companyId = company.id

					headquartersCountries = (company.headquartersCountries as string[] | null | undefined) || null
					evaluateInternationalCandidates = company.evaluateInternationalCandidates as boolean | undefined

					if (!headquartersCountries || headquartersCountries.length === 0) {
						console.log(
							'[get-interviews] Empresa sem países sede definidos, usando fallback (exibir todos)',
						)
					}
				} catch (error) {
					console.warn(
						'[get-interviews] Erro ao buscar dados da empresa, usando fallback:',
						error,
					)
				}

				const { interviews, nextCursor, hasMore } = await processPublicInterviews({
					find,
					careerLevel,
					country,
					state,
					city,
					startDate,
					endDate,
					cursor,
					limit,
					hardSkillTag,
					hardSkillArea,
					minHardSkillPontuacao,
					hardSkillNivelEvidencia,
					senioridadeNivel,
					minConfiancaSenioridade,
					tipoEmpresaIdeal,
					porteEmpresa,
					minScoreGeral,
					minYearsExperience,
					headquartersCountries,
					evaluateInternationalCandidates,
					companyId,
					unlockedOnly,
				})

				return {
					interviews,
					nextCursor,
					hasMore,
				}
			},
		)
}
