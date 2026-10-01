import {
	CoployApiError,
	configureCoploySdk,
	coployFetch,
	getCoploySdkConfig,
} from '../http'

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}

describe('coployFetch', () => {
	it('falha com mensagem acionável quando o SDK não foi configurado', async () => {
		// reset via configure não existe de propósito; simula estado inicial importando fresco
		jest.resetModules()
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fresh = require('../http') as typeof import('../http')
		await expect(fresh.coployFetch('/companies/jobs', { method: 'GET' })).rejects.toThrow(
			/configureCoploySdk/,
		)
	})

	it('prefixa baseUrl por concatenação (preserva path prefix do LB) e injeta Bearer', async () => {
		const calls: Array<{ url: string; init: RequestInit }> = []
		configureCoploySdk({
			baseUrl: 'https://api-hml.coploy.io/core/', // barra final é normalizada
			getToken: async () => 'tok-123',
			fetch: async (url, init) => {
				calls.push({ url: String(url), init: init as RequestInit })
				return jsonResponse(200, { ok: true })
			},
		})

		const out = await coployFetch<{ data: { ok: boolean }; status: number }>(
			'/companies/jobs?limit=1',
			{ method: 'GET' },
		)

		expect(out.data).toEqual({ ok: true })
		expect(out.status).toBe(200)
		expect(calls[0].url).toBe('https://api-hml.coploy.io/core/companies/jobs?limit=1')
		const headers = new Headers(calls[0].init.headers)
		expect(headers.get('authorization')).toBe('Bearer tok-123')
	})

	it('usa x-api-key quando não há token (superfície integracoes)', async () => {
		let seen: Headers | null = null
		configureCoploySdk({
			baseUrl: 'https://api.coploy.io',
			apiKey: 'company-key',
			fetch: async (_url, init) => {
				seen = new Headers((init as RequestInit).headers)
				return jsonResponse(200, {})
			},
		})
		await coployFetch('/integrations/x', { method: 'POST', body: '{}' })
		expect(seen!.get('x-api-key')).toBe('company-key')
		expect(seen!.get('authorization')).toBeNull()
		expect(seen!.get('content-type')).toBe('application/json')
	})

	it('erro HTTP vira CoployApiError com status e body', async () => {
		configureCoploySdk({
			baseUrl: 'https://api.coploy.io',
			fetch: async () => jsonResponse(403, { message: 'Sem crédito' }),
		})
		const err = (await coployFetch('/companies/jobs', { method: 'GET' }).catch(
			(e: unknown) => e,
		)) as CoployApiError
		expect(err).toBeInstanceOf(CoployApiError)
		expect(err.status).toBe(403)
		expect(err.body).toEqual({ message: 'Sem crédito' })
		expect(err.message).toContain('Sem crédito')
	})

	it('normaliza baseUrl removendo barras finais', () => {
		configureCoploySdk({ baseUrl: 'https://x.io/core///' })
		expect(getCoploySdkConfig()?.baseUrl).toBe('https://x.io/core')
	})
})

/**
 * Regressão do upload.
 *
 * O runtime forçava `application/json` em qualquer corpo definido, o que apagava
 * o boundary que o `FormData` precisa — e assim quebrava upload de arquivo em
 * qualquer consumidor do SDK, silenciosamente (o request sai, o servidor é que
 * não consegue abrir).
 */
describe('content-type', () => {
	it('não sobrescreve o content-type de um FormData', async () => {
		let seen: RequestInit | undefined
		configureCoploySdk({
			baseUrl: 'https://api.test',
			fetch: (async (_url: string, init: RequestInit) => {
				seen = init
				return new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			}) as never,
		})

		const form = new FormData()
		form.append('file', new Blob(['x']), 'a.png')
		await coployFetch('/upload/file', { method: 'POST', body: form })

		expect(new Headers(seen?.headers).has('content-type')).toBe(false)
	})

	it('mantém application/json para corpo comum', async () => {
		let seen: RequestInit | undefined
		configureCoploySdk({
			baseUrl: 'https://api.test',
			fetch: (async (_url: string, init: RequestInit) => {
				seen = init
				return new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			}) as never,
		})

		await coployFetch('/x', { method: 'POST', body: JSON.stringify({ a: 1 }) })

		expect(new Headers(seen?.headers).get('content-type')).toBe('application/json')
	})
})
