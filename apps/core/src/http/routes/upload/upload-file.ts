import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { env } from '@/env'
import { storageService } from '@/lib/init'

const ALLOWED_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/webp',
	'image/gif',
	'application/pdf',
	'audio/webm',
	'audio/ogg',
	'audio/mp3',
	'audio/mpeg',
	'video/webm',
	'video/mp4',
])

const MAX_FILE_SIZE = env.UPLOAD_MAX_FILE_MB * 1024 * 1024

export function uploadFile(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/upload/file',
			{
				config: {
					rateLimit: rateLimitConfigs.upload,
				},
				schema: {
					'x-surface': 'empresa',
					tags: ['upload'],
					security: [{ bearerAuth: [] }],
					summary: 'Upload a file to storage',
					description:
						'Generic file upload endpoint. Supports images, PDFs, audio, and video. Returns the public URL.',
					consumes: ['multipart/form-data'],
					querystring: z.object({
						folder: z
							.string()
							.default('uploads')
							.describe('Storage folder/path prefix'),
						filename: z
							.string()
							.min(1)
							.optional()
							.describe('Optional filename override (keeps original name format when provided)'),
					}),
					response: {
						200: z.object({
							url: z.string(),
							filename: z.string(),
							contentType: z.string(),
						}),
					},
				},
			},
			async (request) => {
				await request.getCurrentUser()

				const file = await request.file()
				if (!file) {
					throw new Error('File is required')
				}

				if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
					throw new Error(
						`File type ${file.mimetype} is not allowed. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
					)
				}

				const buffer = await file.toBuffer()

				if (buffer.length > MAX_FILE_SIZE) {
					throw new Error(`File exceeds maximum size of ${env.UPLOAD_MAX_FILE_MB}MB`)
				}

				const { folder, filename } = request.query
				const timestamp = Date.now()
				const originalName = file.filename || 'upload.bin'
				const safeOriginalFilename = originalName.replaceAll(/[^\w.-]/g, '_')
				const safeRequestedFilename = filename?.replaceAll(/[^\w.-]/g, '_')
				const resolvedFilename = safeRequestedFilename || `${timestamp}_${safeOriginalFilename}`
				const storagePath = `${folder}/${resolvedFilename}`

				const uploadedUrl = await storageService.uploadFile(
					buffer,
					folder,
					resolvedFilename,
					file.mimetype,
				)

				let url = uploadedUrl
				if (env.INFRA_PROVIDER === 'selfhosted') {
					const encodedObjectPath = `${folder}/${resolvedFilename}`
						.split('/')
						.map((segment) => encodeURIComponent(segment))
						.join('/')
					const apiBaseUrl = (env as any).BETTERAUTH_URL.replace(/\/+$/, '')
					url = `${apiBaseUrl}/storage/public/${encodedObjectPath}`
				}

				return {
					url,
					filename: storagePath,
					contentType: file.mimetype,
				}
			},
		)
}
