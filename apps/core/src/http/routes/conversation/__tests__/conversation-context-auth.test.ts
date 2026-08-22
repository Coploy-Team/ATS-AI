import { fastify, type FastifyInstance } from 'fastify'
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { errorHandler } from '@/http/error-handle'
import { createConversationContext } from '../create-conversation-context'
import { getConversationContext } from '../get-conversation-context'
import { createMockInfra } from '@/lib/services/__tests__/mock-infra'

async function buildApp(infra = createMockInfra()) {
	const app = fastify().withTypeProvider<ZodTypeProvider>()
	app.decorate('infra', infra)
	app.setSerializerCompiler(serializerCompiler)
	app.setValidatorCompiler(validatorCompiler)
	app.setErrorHandler(errorHandler)
	app.register(createConversationContext)
	app.register(getConversationContext)
	await app.ready()
	return app
}

describe('conversation-context routes (x-api-key auth)', () => {
	let app: FastifyInstance

	afterEach(async () => {
		await app?.close()
	})

	describe('POST /conversation-context', () => {
		it('returns 401 without x-api-key', async () => {
			app = await buildApp()

			const res = await app.inject({
				method: 'POST',
				url: '/conversation-context',
				payload: { phone: '5511999999999', jobId: 'job-1' },
			})

			expect(res.statusCode).toBe(401)
		})

		it('returns 401 with an invalid x-api-key', async () => {
			app = await buildApp()

			const res = await app.inject({
				method: 'POST',
				url: '/conversation-context',
				payload: { phone: '5511999999999', jobId: 'job-1' },
				headers: { 'x-api-key': 'wrong-key' },
			})

			expect(res.statusCode).toBe(401)
		})

		it('reaches the handler with a valid x-api-key', async () => {
			const infra = createMockInfra()
			infra.conversationRepository.getConversationContext.mockResolvedValue(null)
			infra.conversationRepository.createConversationContext.mockResolvedValue(
				undefined as never,
			)
			app = await buildApp(infra)

			const res = await app.inject({
				method: 'POST',
				url: '/conversation-context',
				payload: { phone: '5511999999999', jobId: 'job-1' },
				headers: { 'x-api-key': 'test-core-api-key' },
			})

			expect(res.statusCode).toBe(201)
			expect(
				infra.conversationRepository.createConversationContext,
			).toHaveBeenCalled()
		})
	})

	describe('GET /conversation-context/:phone', () => {
		it('returns 401 without x-api-key', async () => {
			app = await buildApp()

			const res = await app.inject({
				method: 'GET',
				url: '/conversation-context/5511999999999',
			})

			expect(res.statusCode).toBe(401)
		})

		it('returns 401 with an invalid x-api-key', async () => {
			app = await buildApp()

			const res = await app.inject({
				method: 'GET',
				url: '/conversation-context/5511999999999',
				headers: { 'x-api-key': 'wrong-key' },
			})

			expect(res.statusCode).toBe(401)
		})

		it('reaches the handler with a valid x-api-key', async () => {
			const infra = createMockInfra()
			infra.conversationRepository.listConversationContexts.mockResolvedValue([])
			app = await buildApp(infra)

			const res = await app.inject({
				method: 'GET',
				url: '/conversation-context/5511999999999',
				headers: { 'x-api-key': 'test-core-api-key' },
			})

			// Sem contexto ativo e sem message → 404 de negócio (auth passou)
			expect(res.statusCode).toBe(404)
			expect(
				infra.conversationRepository.listConversationContexts,
			).toHaveBeenCalled()
		})
	})
})
