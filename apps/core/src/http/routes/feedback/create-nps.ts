import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import type { Nps } from '@coploy/domain'
import { createFeedbackService } from '@/lib/services/feedback-service'

const createNpsSchema = z.object({
	companyId: z.string().min(1, 'Company ID é obrigatório'),
	jobId: z.string().min(1, 'Job ID é obrigatório'),
	candidateId: z.string().min(1, 'Candidate ID é obrigatório'),
	score: z.number().min(0).max(10, 'Score deve estar entre 0 e 10'),
	comment: z.string().default(''),
	jobApplied: z.string().min(1, 'Job Applied é obrigatório'),
	interviewType: z.enum(['exitJob', 'evaluation', 'interview', 'emotional'], {
		errorMap: () => ({ message: 'Tipo de entrevista inválido' }),
	}),
})

export function createNps(app: FastifyInstance) {
	const feedbackSvc = createFeedbackService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.post(
			'/feedback/nps',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['feedback'],
					security: [{ bearerAuth: [] }],
					summary: 'Create NPS feedback for interview',
					description:
						'Create a new NPS (Net Promoter Score) feedback entry for a specific interview and candidate',
					body: createNpsSchema,
					response: {
						201: z.object({
							success: z.boolean(),
							message: z.string(),
							npsId: z.string(),
							data: z.object({
								id: z.string(),
								companyId: z.string(),
								jobId: z.string(),
								jobName: z.string(),
								candidateId: z.string(),
								candidateName: z.string(),
								candidateEmail: z.string(),
								score: z.number(),
								comment: z.string(),
								interviewType: z.string(),
								jobApplied: z.string(),
								photo_url: z.string(),
								createdAt: z.string(),
							}),
						}),
						400: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const {
					companyId,
					jobId,
					candidateId,
					score,
					comment,
					interviewType,
					jobApplied,
				} = request.body

				// PÚBLICA POR NECESSIDADE: quem responde o NPS é o candidato, na tela
				// de agradecimento (`web/interview/src/pages/ThankYou.tsx`), e ele não
				// tem sessão de empresa. Antes havia um `createAuth` aqui que NUNCA
				// bloqueava nada (o middleware é lazy: só valida quem chama
				// `getUserMembership`) — dava falsa sensação de proteção.
				// ⚠️ Pendência conhecida: `companyId` vem do corpo sem vínculo provado
				// com o candidato, então dá pra poluir o NPS de qualquer empresa.

				try {
					// Search for job data
					const job = await feedbackSvc.getJob(companyId, jobId)

					if (!job) {
						throw new BadRequestError('Vaga não encontrada')
					}

					// Buscar dados do candidato
					const candidate = await feedbackSvc.getUser(candidateId)

					if (!candidate) {
						throw new BadRequestError('Candidato não encontrado')
					}

					// Verificar se já existe um NPS para este candidato/vaga/tipo
					const existingNps = (await feedbackSvc.listNps(companyId, {
						filters: [
							{ field: 'jobId', operator: '==', value: jobId },
							{ field: 'candidateId', operator: '==', value: candidateId },
							{
								field: 'interviewType',
								operator: '==',
								value: interviewType,
							},
						],
						limitTo: 1,
					})) as Nps[]

					if (existingNps.length > 0) {
						throw new BadRequestError(
							'Já existe um NPS para este candidato nesta vaga e tipo de entrevista',
						)
					}

					// Preparar dados do NPS (repositories handle refs internally - pass ids)
					const npsData = {
						companyId,
						jobId,
						jobName: (job as { jobName?: string }).jobName || 'Nome não disponível',
						candidateId,
						candidateName:
							(candidate as { display_name?: string }).display_name ||
							`${(candidate as { first_name?: string }).first_name ?? ''} ${(candidate as { last_name?: string }).last_name ?? ''}`.trim() ||
							'Nome não disponível',
						candidateEmail: (candidate as { email?: string }).email || 'Email não disponível',
						score,
						comment: comment || '',
						interviewType,
						createdAt: new Date(),
						photo_url: (candidate as { photo_url?: string }).photo_url,
						jobApplied,
					}

					// Salvar no Firestore
					const createdNps = (await feedbackSvc.createNps(
						companyId,
						npsData,
					)) as Nps

					return reply.status(201).send({
						success: true,
						message: 'NPS criado com sucesso',
						npsId: createdNps.id,
						data: {
							id: createdNps.id,
							companyId: createdNps.companyId,
							jobId: createdNps.jobId,
							jobName: createdNps.jobName,
							candidateId: createdNps.candidateId,
							candidateName: createdNps.candidateName,
							candidateEmail: createdNps.candidateEmail,
							score: createdNps.score,
							comment: createdNps.comment,
							interviewType: createdNps.interviewType,
							jobApplied: createdNps.jobApplied,
							photo_url: createdNps.photo_url ?? '',
							createdAt:
								createdNps.createdAt instanceof Date
									? createdNps.createdAt.toISOString()
									: new Date().toISOString(),
						},
					})
				} catch (error) {
					if (error instanceof BadRequestError) {
						throw error
					}

					throw new BadRequestError('Erro interno do servidor ao criar NPS')
				}
			},
		)
}
