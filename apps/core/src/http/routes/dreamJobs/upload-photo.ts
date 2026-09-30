import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { BadRequestError } from '@coploy/shared/errors'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

export function uploadCandidatePhoto(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .post(
      '/dream-jobs/upload-photo',
      {
        config: {
          rateLimit: rateLimitConfigs.upload,
        },
        schema: {
          'x-surface': 'candidato',
          tags: ['dream_jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Upload candidate profile photo',
          description: 'Upload a profile photo for the authenticated candidate (max 5MB)',
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
            throw new BadRequestError('Photo file is required')
          }

          // Validate file type
          const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
          ]
          if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestError(
              'Invalid file type. Only JPEG, PNG, and WebP are allowed'
            )
          }

          // Validate file size (5MB max)
          const buffer = await file.toBuffer()
          const fileSizeInMB = buffer.length / (1024 * 1024)
          if (fileSizeInMB > 5) {
            throw new BadRequestError(
              'File size exceeds the maximum limit of 5MB'
            )
          }

          const photoUrl = await dreamJobsService.uploadFile(
            buffer,
            `candidates/${userId}`,
            `photo`,
            file.mimetype
          )

          // Update candidate profile with photo URL
          await dreamJobsService.updateCandidateProfile(userId, {
            photo_url: photoUrl,
            updatedAt: new Date().toISOString(),
          } as Record<string, unknown>)

          return reply.status(200).send({
            url: photoUrl,
            message: 'Photo uploaded successfully',
          })
        } catch (error) {
          if (error instanceof BadRequestError) {
            throw error
          }
          throw new BadRequestError('Failed to upload photo')
        }
      }
    )
}
