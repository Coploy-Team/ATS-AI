import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { BadRequestError } from '@coploy/shared/errors'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

export function uploadResume(app: FastifyInstance) {
	const dreamJobsService = createDreamJobsService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/dream-jobs/upload-resume',
			{
				config: {
					rateLimit: rateLimitConfigs.upload,
				},
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Upload user resume (PDF, DOC, DOCX)',
					description: 'Upload a resume file for the authenticated user (max 5MB)',
					consumes: ['multipart/form-data'],
					response: {
						200: z.object({
							url: z.string(),
							message: z.string(),
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				try {
					const userId = await request.getCurrentUser()

					// Process the file upload
					const file = await request.file()
					if (!file) {
						throw new BadRequestError('Resume file is required')
					}

					// Validate file type
					const allowedMimeTypes = [
						'application/pdf',
						'application/msword',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
					]
					if (!allowedMimeTypes.includes(file.mimetype)) {
						throw new BadRequestError(
							'Invalid file type. Only PDF, DOC, and DOCX are allowed',
						)
					}

					// Validate file size (5MB max)
					const buffer = await file.toBuffer()
					const fileSizeInMB = buffer.length / (1024 * 1024)
					if (fileSizeInMB > 5) {
						throw new BadRequestError(
							'File size exceeds the maximum limit of 5MB',
						)
					}

					// Determine file extension
					const fileExtension =
						file.mimetype === 'application/pdf'
							? 'pdf'
							: file.mimetype === 'application/msword'
								? 'doc'
								: 'docx'

					const filename = `${userId}-resume.${fileExtension}`
					const resumeUrl = await dreamJobsService.uploadFile(
						buffer,
						`users/${userId}`,
						`resume`,
						file.mimetype,
					)

					// Update user document with resume URL
					await dreamJobsService.updateUser(userId, { resumeUrl })

					return reply.status(200).send({
						url: resumeUrl,
						message: 'Resume uploaded successfully',
					})
				} catch (error) {
					if (error instanceof BadRequestError) {
						throw error
					}
					throw new BadRequestError('Failed to upload resume')
				}
			},
		)
}
