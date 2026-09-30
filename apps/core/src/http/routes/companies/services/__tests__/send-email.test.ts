import { fastify, type FastifyInstance } from 'fastify'
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { errorHandler } from '@/http/error-handle'
import { sendEmail } from '../send-email'
import { createMockInfra } from '@/lib/services/__tests__/mock-infra'

async function buildApp() {
	const app = fastify().withTypeProvider<ZodTypeProvider>()
	app.decorate('infra', createMockInfra())
	app.setSerializerCompiler(serializerCompiler)
	app.setValidatorCompiler(validatorCompiler)
	app.setErrorHandler(errorHandler)
	app.register(sendEmail)
	await app.ready()
	return app
}

const validPayload = {
	email: 'candidato@example.com',
	templateId: 123,
	templateModel: { nomeCandidato: 'Fulana', body: 'Olá' },
	fromEmail: 'no-reply@coploy.io',
}

describe('POST /send-email (bearer auth)', () => {
	let app: FastifyInstance

	afterEach(async () => {
		await app?.close()
	})

	it('returns 401 without Authorization header', async () => {
		app = await buildApp()

		const res = await app.inject({
			method: 'POST',
			url: '/send-email',
			payload: validPayload,
		})

		expect(res.statusCode).toBe(401)
	})

	it('returns 401 with an invalid bearer token', async () => {
		app = await buildApp()

		const res = await app.inject({
			method: 'POST',
			url: '/send-email',
			payload: validPayload,
			headers: { authorization: 'Bearer invalid-token' },
		})

		expect(res.statusCode).toBe(401)
	})
})
