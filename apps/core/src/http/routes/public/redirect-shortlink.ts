import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createUrlShortener, buildOriginalUrl } from '@/lib/url-shortener'

export function redirectShortLink(app: FastifyInstance) {
	const { resolveShortLink } = createUrlShortener(app.infra)
	app.withTypeProvider<ZodTypeProvider>().get(
		'/s/:code',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['public'],
				summary: 'Redirect short link to original interview URL',
				description:
					'Resolves a short link code and redirects to the original interview URL',
				params: z.object({
					code: z
						.string()
						.min(8)
						.max(8)
						.describe('Short link code (8 characters)'),
				}),
				response: {
					302: z.object({
						message: z.string(),
						redirectUrl: z.string(),
					}),
					404: z.object({
						message: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			const { code } = request.params

			try {
				const shortLinkData = await resolveShortLink(code)

				if (!shortLinkData) {
					throw new BadRequestError('Short link not found or expired')
				}

				// Construir URL de redirecionamento
				const redirectUrl = buildOriginalUrl(shortLinkData)

				// Fazer redirecionamento HTTP 302 (temporário)
				reply.code(302)
				reply.header('Location', redirectUrl)
				reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')

				return {
					message: 'Redirecting to interview',
					redirectUrl,
				}
			} catch {
				throw new BadRequestError('Invalid or expired short link')
			}
		},
	)
}

/**
 * Endpoint alternativo que retorna JSON com os dados da URL (útil para SPAs)
 */
export function getShortLinkData(app: FastifyInstance) {
	const { resolveShortLink } = createUrlShortener(app.infra)
	app.withTypeProvider<ZodTypeProvider>().get(
		'/s/:code/data',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['public'],
				summary: 'Get short link data as JSON',
				description:
					'Returns the original URL data as JSON instead of redirecting',
				params: z.object({
					code: z
						.string()
						.min(8)
						.max(8)
						.describe('Short link code (8 characters)'),
				}),
				response: {
					200: z.object({
						jobId: z.string(),
						companyId: z.string(),
						originalUrl: z.string(),
						utmSource: z.string().optional(),
						utmMedium: z.string().optional(),
						utmCampaign: z.string().optional(),
						utmContent: z.string().optional(),
					}),
					404: z.object({
						message: z.string(),
					}),
				},
			},
		},
		async (request) => {
			const { code } = request.params

			try {
				const shortLinkData = await resolveShortLink(code)

				if (!shortLinkData) {
					throw new BadRequestError('Short link not found or expired')
				}

				// Construir URL original
				const originalUrl = buildOriginalUrl(shortLinkData)

				return {
					...shortLinkData,
					originalUrl,
				}
			} catch {
				throw new BadRequestError('Invalid or expired short link')
			}
		},
	)
}
