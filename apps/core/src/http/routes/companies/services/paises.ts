import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'

const paisesSchema = z.object({
	name: z.string(),
	code: z.string(),
})

export function paises(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/paises',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['paises'],
				response: {
					200: z.array(paisesSchema),
					500: z.object({ message: z.string() }),
				},
			},
		},
		async (_request, reply) => {
			try {
				const response = await fetch('https://www.apicountries.com/countries')
				const data = await response.json() as any[]

				const simplifiedData = data.map((country: any) => ({
					name: country.name,
					code: country.alpha2Code || country.code || '',
				}))

				return reply.status(200).send(simplifiedData)
			} catch (error) {
				throw new BadRequestError(error as string)
			}
		},
	)
}
