import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { storageService } from '@/lib/init'
import { createAuth } from '../middlewares/auth'

function decodePathSafe(value: string): string {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

export function presignedUpload(app: FastifyInstance) {
	app.get(
		'/storage/public/*',
		{
			schema: {
				hide: true, // wildcard route — excluded from OpenAPI (self-hosted only proxy)
			},
		},
		async (request, reply) => {
			const wildcardPath = (request.params as { '*': string })['*'] ?? ''
			const objectPath = decodePathSafe(wildcardPath).replace(/^\/+/, '')

			const lastSlashIndex = objectPath.lastIndexOf('/')
			if (lastSlashIndex <= 0 || lastSlashIndex >= objectPath.length - 1) {
				return reply.code(400).send({ message: 'Invalid storage object path' })
			}

			const path = objectPath.slice(0, lastSlashIndex)
			const filename = objectPath.slice(lastSlashIndex + 1)

			const signedUrl = await storageService.getDownloadUrl(path, filename)
			if (!signedUrl) {
				return reply.code(404).send({ message: 'File not found' })
			}

			const upstreamHeaders: Record<string, string> = {}
			if (request.headers.range) {
				upstreamHeaders.range = request.headers.range
			}

			const upstream = await fetch(signedUrl, {
				headers: upstreamHeaders,
			})

			if (!upstream.ok || !upstream.body) {
				return reply
					.code(upstream.status || 502)
					.send({ message: 'Failed to fetch file from storage' })
			}

			const allowedHeaders = [
				'content-type',
				'content-length',
				'content-range',
				'accept-ranges',
				'cache-control',
				'etag',
				'last-modified',
			]

			for (const headerName of allowedHeaders) {
				const value = upstream.headers.get(headerName)
				if (value) {
					reply.header(headerName, value)
				}
			}

			reply.code(upstream.status)
			return reply.send(Readable.fromWeb(upstream.body as unknown as globalThis.ReadableStream))
		},
	)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/storage/presigned-upload',
			{
				schema: {
					'x-surface': 'empresa',
				'x-infra-dependent': 'selfhosted',
				tags: ['storage'],
					summary: 'Get a presigned URL for direct upload to storage (self-hosted only)',
					security: [{ bearerAuth: [] }],
					body: z.object({
						path: z.string().min(1),
						filename: z.string().min(1),
						contentType: z.string().min(1),
					}),
					response: {
						200: z.object({
							uploadUrl: z.string(),
							downloadUrl: z.string(),
							objectPath: z.string(),
						}),
					},
				},
			},
			async (request) => {
				await request.getCurrentUser()

				const { path, filename, contentType } = request.body

				if (!storageService.getPresignedUploadUrl) {
					throw new Error('Presigned uploads not available in this provider. Use Firebase Storage SDK directly.')
				}

				return storageService.getPresignedUploadUrl(path, filename, contentType)
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/storage/download-url',
			{
				schema: {
					'x-surface': 'empresa',
				'x-infra-dependent': 'selfhosted',
				tags: ['storage'],
					summary: 'Get a download URL for a stored file (self-hosted only)',
					security: [{ bearerAuth: [] }],
					querystring: z.object({
						path: z.string().min(1),
						filename: z.string().min(1),
					}),
					response: {
						200: z.object({
							url: z.string().nullable(),
						}),
					},
				},
			},
			async (request) => {
				await request.getCurrentUser()

				const { path, filename } = request.query
				const url = await storageService.getDownloadUrl(path, filename)
				return { url }
			},
		)
}
