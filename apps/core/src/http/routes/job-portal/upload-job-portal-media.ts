import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import {
	JobPortalSchema,
	type JobPortal as JobPortalType,
} from '@/schemas/job-portal-schema'
import type { JobPortal } from '@/types/job-portal'
import type { Company } from '@coploy/domain'
import { createJobPortalService } from '@/lib/services/job-portal-service'

export async function uploadJobPortalMedia(app: FastifyInstance) {
	const jobPortalService = createJobPortalService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/job-portal/media',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-portal'],
					security: [{ bearerAuth: [] }],
					summary: 'Upload job portal logo and banner',
					consumes: ['multipart/form-data'],
					response: {
						200: z.object({
							jobPortal: JobPortalSchema,
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { company: _company } = await request.getUserMembership()
					const company = _company as Company & { id: string }

					// cria o portal na primeira mídia — subir o banner É o começo da
					// configuração, não pode exigir um portal pré-existente
					const existingJobPortal = (await jobPortalService.ensurePortal(
						company,
					)) as JobPortal & { id: string }

					const files = request.files()
					const filesArray = []
					for await (const file of files) {
						// Processar o buffer do arquivo imediatamente para evitar travamento

						const buffer = await file.toBuffer()

						// Criar objeto com dados do arquivo já processados
						filesArray.push({
							fieldname: file.fieldname,
							filename: file.filename,
							mimetype: file.mimetype,
							buffer: buffer,
						})
					}

					const logo = filesArray.find((file) => file.fieldname === 'logo')
					const banner = filesArray.find((file) => file.fieldname === 'banner')

					if (!(logo || banner)) {
						throw new BadRequestError(
							'Pelo menos um arquivo (logo ou banner) é obrigatório',
						)
					}

					// Validar tipos dos arquivos

					const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg']

					let logoUrl = existingJobPortal.logoUrl
					let bannerUrl = existingJobPortal.bannerUrl

					// Upload do logo se fornecido
					if (logo) {
						if (!allowedMimeTypes.includes(logo.mimetype)) {
							throw new BadRequestError(
								'Tipo de arquivo inválido para o logo. Apenas PNG, JPG e JPEG são permitidos',
							)
						}

						const logoFilename = `${existingJobPortal.id}-logo`

						logoUrl = await jobPortalService.uploadFile(
							logo.buffer,
							'job-portal',
							logoFilename,
							logo.mimetype,
						)
					}

					// Upload do banner se fornecido
					if (banner) {
						if (!allowedMimeTypes.includes(banner.mimetype)) {
							throw new BadRequestError(
								'Tipo de arquivo inválido para o banner. Apenas PNG, JPG e JPEG são permitidos',
							)
						}

						const bannerFilename = `${existingJobPortal.id}-banner`

						bannerUrl = await jobPortalService.uploadFile(
							banner.buffer,
							'job-portal',
							bannerFilename,
							banner.mimetype,
						)
					}

					// Atualizar URLs no documento

					const updateData = {
						...(logo && { logoUrl }),
						...(banner && { bannerUrl }),
					}

					await jobPortalService.updateJobPortal(
						existingJobPortal.id,
						updateData,
					)

					// Retornar o documento atualizado
					const updatedJobPortal = await jobPortalService.getJobPortal(
						existingJobPortal.id,
					) as JobPortal | null
					if (!updatedJobPortal) {
						throw new BadRequestError(
							'Falha ao recuperar o job portal atualizado',
						)
					}

					// GCP guarda ref `company`; selfhosted guarda `company_id` plano —
					// derreferenciar sem checar quebrava o retorno na distribuição open
					const companyRef = updatedJobPortal.company as { id?: string } | string | undefined
					const jobPortalData: JobPortalType = {
						...updatedJobPortal,
						company:
							typeof companyRef === 'string'
								? companyRef
								: (companyRef?.id ??
									(updatedJobPortal as { company_id?: string }).company_id ??
									company.id),
					}

					return {
						jobPortal: jobPortalData,
					}
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
