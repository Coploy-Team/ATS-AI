import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'

import { authDreamJobs } from '../middlewares/authDreamJobs'

const ALLOWED_MIME_TYPES: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const MAX_RESUME_BYTES = 5 * 1024 * 1024

/**
 * Upload do currículo do CANDIDATO — o arquivo em si, provider-agnóstico.
 *
 * No SaaS o cliente web sobe direto no Firebase Storage; a distribuição open
 * não tem Firebase, e era o único jeito de anexar currículo. Esta rota fecha
 * o buraco pelos DOIS lados: o storage adapter grava onde a instalação manda
 * (MinIO no selfhosted, bucket no GCP) e devolve a URL pública — que o apply
 * envia como `resumeUrl`, o mesmo campo de sempre.
 *
 * Caminho `users/{uid}/resume.{ext}` espelha o padrão do Firebase (sobrescreve
 * o anterior): um currículo por pessoa, o mais novo vale.
 */
export function uploadCandidateResume(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/careers/resume',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					consumes: ['multipart/form-data'],
					summary: 'Upload the candidate resume file (PDF/DOC/DOCX, 5MB max)',
					response: {
						200: z.object({
							resumeUrl: z.string(),
							filename: z.string(),
						}),
						400: z.object({ message: z.string() }),
					},
				},
			},
			async (request) => {
				const candidateUserId = await request.getCurrentUser()

				const file = await request.file({ limits: { fileSize: MAX_RESUME_BYTES } })
				if (!file) {
					throw new BadRequestError('Nenhum arquivo enviado')
				}

				/*
				 * O stream PRECISA ser consumido antes de qualquer recusa: lançar com
				 * o body pendente aborta a conexão e o cliente vê "network error" em
				 * vez do 400 com a mensagem.
				 */
				const buffer = await file.toBuffer().catch(() => {
					// o toBuffer lança quando o stream estoura o limite
					throw new BadRequestError('O arquivo deve ter no máximo 5MB.')
				})

				const extension = ALLOWED_MIME_TYPES[file.mimetype]
				if (!extension) {
					throw new BadRequestError('Formato inválido. Envie um arquivo PDF, DOC ou DOCX.')
				}

				const resumeUrl = await app.infra.storage.uploadFile(
					buffer,
					`users/${candidateUserId}`,
					`resume.${extension}`,
					file.mimetype,
				)

				return { resumeUrl, filename: file.filename }
			},
		)
}
