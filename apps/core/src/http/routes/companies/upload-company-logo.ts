import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createCompanyService } from '@/lib/services/company-service'
import { CompaniesSchema } from '@/schemas/companies-schema'

const responseSchema = z.object({ company: CompaniesSchema })
type ResponseShape = z.infer<typeof responseSchema>

export function uploadCompanyLogo(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/logo',
			{
				config: {
					rateLimit: rateLimitConfigs.upload,
				},
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Upload company logo',
					description: 'Upload a new logo for a company (PNG, JPG, JPEG)',
					consumes: ['multipart/form-data'],
					response: {
						200: responseSchema,
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()

				const logo = await request.file()
				if (!logo) {
					throw new Error('Logo file is required')
				}

				const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg']
				if (!allowedMimeTypes.includes(logo.mimetype)) {
					throw new Error('Invalid file type')
				}

				const buffer = await logo.toBuffer()
				const result = await companyService.uploadLogo(company.id, buffer, logo.mimetype)
				return reply.send({ company: result } as unknown as ResponseShape)
			},
		)
}
