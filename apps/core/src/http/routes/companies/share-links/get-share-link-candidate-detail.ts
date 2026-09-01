import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createUserService } from '@/lib/services/user-service'
import { createJobsService } from '@/lib/services/jobs-service'
import {
	createSharedCandidateLinkService,
	stripInterviewDetail,
} from '@/lib/services/shared-candidate-link-service'
import type { Interview } from '@/types/interviews'

export function getShareLinkCandidateDetail(app: FastifyInstance) {
	const userService = createUserService(app.infra)
	const jobsService = createJobsService(app.infra)
	const sharedCandidateLinkService = createSharedCandidateLinkService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/share-links/:code/candidates/:userId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get a single candidate detail liberated by a share link',
					params: z.object({
						code: z.string(),
						userId: z.string(),
					}),
					response: {
						200: z.object({
							jobApplied: z.record(z.string(), z.unknown()),
							/*
							 * O CURRÍCULO do candidato.
							 *
							 * Faltava, e o destinatário recebia um vídeo de alguém sem
							 * saber a trajetória dessa pessoa — decidir sobre um candidato
							 * sem o histórico dele é decidir no escuro. Vai na base, junto
							 * do nome: currículo é identidade, não avaliação. O que as
							 * seções cortam é o julgamento da IA, não quem a pessoa é.
							 */
							profile: z
								.object({
									headline: z.string().nullable(),
									summary: z.string().nullable(),
									resumeUrl: z.string().nullable(),
									skills: z.array(z.string()),
									experiences: z.array(z.record(z.string(), z.unknown())),
									education: z.array(z.record(z.string(), z.unknown())),
									languages: z.array(z.record(z.string(), z.unknown())),
								})
								.nullable(),
							visibility: z.object({
								score: z.boolean(),
								feedback: z.boolean(),
								analysis: z.boolean(),
								questions: z.boolean(),
							}),
						}),
						404: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const membership = await request.getUserMembership()
				const { code, userId } = request.params

				const record = await sharedCandidateLinkService.resolveShareLink(code)

				if (record.companyId !== membership.company.id) {
					throw new BadRequestError('Share link inválido')
				}

				if (!record.candidateIds.includes(userId)) {
					throw new BadRequestError('Candidato fora do link de compartilhamento')
				}

				const jobInterviews = (await jobsService.listJobInterviews(
					record.companyId,
					record.jobId,
					{
						filters: [
							{ field: 'finished', operator: '==', value: true },
						],
					},
				)) as Interview[]

				const matchedInterview =
					jobInterviews.find((interview) => interview.user_ref?.id === userId) ??
					null
				const jobAppliedId = matchedInterview?.job_applied_ref?.id

				if (!jobAppliedId) {
					return reply.status(404).send({ message: 'JobApplied não encontrado' })
				}

				const result = await userService.buildViewerJobAppliedDetail({
					userId,
					jobAppliedId,
					membership,
				})

				if (!result) {
					return reply.status(404).send({ message: 'JobApplied não encontrado' })
				}

				/*
				 * QUEM É A PESSOA entra ANTES do corte.
				 *
				 * `buildViewerJobAppliedDetail` não devolve nome, cargo nem foto — eles
				 * vivem no registro da entrevista, que esta rota já carregou acima. Sem
				 * isso o destinatário abria o vídeo sem saber de quem era, e a tela
				 * caía no título genérico. Injetar aqui (e não depois) mantém a
				 * allowlist como único juiz do que é compartilhável.
				 */
				const comIdentidade = {
					jobApplied: {
						...result.jobApplied,
						name: matchedInterview?.name ?? null,
						occupation: (matchedInterview as { occupation?: string } | null)?.occupation ?? null,
						photo_url: (matchedInterview as { photo_url?: string } | null)?.photo_url ?? null,
					},
				}

				const perfilBruto = (await app.infra.userRepository
					.getCandidateProfile(userId)
					.catch(() => null)) as Record<string, unknown> | null

				const comoLista = (valor: unknown) =>
					Array.isArray(valor) ? (valor as Array<Record<string, unknown>>) : []

				const profile = perfilBruto
					? {
							headline: (perfilBruto.headline as string) ?? null,
							summary: (perfilBruto.summary as string) ?? null,
							resumeUrl: (perfilBruto.resumeUrl as string) ?? null,
							skills: Array.isArray(perfilBruto.skills)
								? (perfilBruto.skills as unknown[]).filter(
										(item): item is string => typeof item === 'string',
									)
								: [],
							experiences: comoLista(perfilBruto.experiences),
							education: comoLista(perfilBruto.education),
							languages: comoLista(perfilBruto.languages),
						}
					: null

				const stripped = stripInterviewDetail(comIdentidade, record.sections)

				return reply.send({
					jobApplied: stripped.jobApplied,
					profile,
					visibility: record.sections,
				})
			},
		)
}
