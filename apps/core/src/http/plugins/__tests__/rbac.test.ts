import Fastify from 'fastify'
import fastifyPlugin from 'fastify-plugin'

import { registerRbac } from '@/http/plugins/rbac'

/**
 * O hook contra um Fastify de verdade.
 *
 * Testar a tabela em isolamento prova que o mapa está certo, não que ele é
 * consultado. O bug que interessa aqui é o do middleware anterior: registrado,
 * mas inerte. Então estas rotas são registradas de verdade e chamadas por HTTP.
 */
/**
 * O colaborador guarda a identidade em `userRef` — é assim no dado real, e era
 * exatamente o que o `resolveRole` NÃO procurava. O mock usava `userId`, que
 * não existe em produção, então os testes passavam enquanto o produto deixava
 * todo mundo como owner.
 */
function infraWith(accessLevel: string | undefined, shape: 'userRef' | 'path' | 'email' = 'userRef') {
	const row =
		shape === 'userRef'
			? { userRef: { id: 'u1' }, email: 'p@p.com', accessLevel }
			: shape === 'path'
				? { userRef: 'users/u1', email: 'p@p.com', accessLevel }
				: { email: 'p@p.com', accessLevel }
	return {
		collaboratorRepository: { listCollaborators: async () => [row] },
	} as never
}

async function buildApp(
	accessLevel: string | undefined,
	shape: 'userRef' | 'path' | 'email' = 'userRef',
) {
	const app = Fastify()

	app.decorateRequest('getUserMembership', null)
	app.decorateRequest('getCurrentUser', null)

	registerRbac(app, infraWith(accessLevel, shape))

	/*
	 * A ORDEM aqui é o teste.
	 *
	 * O `createAuthMiddleware` (packages/shared) não decora o request no boot:
	 * ele instala `getUserMembership` de dentro de um `preHandler` próprio,
	 * registrado depois do RBAC porque vem junto de cada rota. A versão antiga
	 * deste harness decorava num `onRequest` — que roda antes de qualquer
	 * preHandler — e por isso passava enquanto, em produção, o guard rodava
	 * primeiro, esbarrava num decorator inexistente e liberava o request.
	 *
	 * Registrar depois, e como preHandler, reproduz a produção.
	 */
	await app.register(
		fastifyPlugin(async (instance) => {
			instance.addHook('preHandler', async (request) => {
				;(request as never as Record<string, unknown>).getUserMembership = async () => ({
					company: { id: 'c1' },
					user: { email: 'p@p.com' },
				})
				;(request as never as Record<string, unknown>).getCurrentUser = async () => 'u1'
			})
		}),
	)

	/*
	 * Registrada em escopo FILHO de propósito: é assim que toda rota real entra
	 * (`app.register(getJobs)`). Um hook que só valesse no escopo raiz passaria
	 * nos outros testes e não protegeria nada em produção — o mesmo modo de
	 * falha do middleware anterior, registrado e inerte.
	 */
	await app.register(async (child) => {
		child.get('/companies/jobs', { schema: { 'x-surface': 'empresa' } }, async () => ({
			ok: true,
		}))
	})
	app.delete(
		'/companies/jobs/:jobId',
		{ schema: { 'x-surface': 'empresa' } },
		async () => ({ ok: true }),
	)
	app.post('/rota/sem/politica', { schema: { 'x-surface': 'empresa' } }, async () => ({ ok: true }))
	// candidato não tem papel de tenant: o hook não deve nem tentar
	app.get('/dream-jobs/profile', { schema: { 'x-surface': 'candidato' } }, async () => ({
		ok: true,
	}))

	await app.ready()
	return app
}

describe('hook de RBAC', () => {
	const original = process.env.RBAC_ENFORCE
	let warn: jest.SpyInstance

	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		warn.mockRestore()
		if (original === undefined) delete process.env.RBAC_ENFORCE
		else process.env.RBAC_ENFORCE = original
	})

	it('em shadow, registra o que bloquearia e deixa passar', async () => {
		delete process.env.RBAC_ENFORCE
		const app = await buildApp('shared')

		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })

		expect(response.statusCode).toBe(200)
		const logged = JSON.parse(warn.mock.calls[0][0] as string)
		expect(logged).toMatchObject({
			tag: 'rbac.denied',
			enforcing: false,
			capability: 'job:delete',
			role: 'shared',
		})
		await app.close()
	})

	it('com enforcement, bloqueia com 403 e diz qual capability faltou', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('shared')

		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })

		expect(response.statusCode).toBe(403)
		expect(response.json()).toMatchObject({ capability: 'job:delete', role: 'shared' })
		await app.close()
	})

	it('deixa passar quem tem a capability', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('shared')

		const response = await app.inject({ method: 'GET', url: '/companies/jobs' })

		expect(response.statusCode).toBe(200)
		await app.close()
	})

	/*
	 * O ponto do desenho fail-closed: esquecer de mapear não abre a rota em
	 * silêncio. Se este teste virar verde com 200 sob enforcement, a tabela
	 * deixou de ser a política e virou sugestão.
	 */
	it('rota sem política é logada em shadow e bloqueada com enforcement', async () => {
		delete process.env.RBAC_ENFORCE
		const shadow = await buildApp('owner')
		const passed = await shadow.inject({ method: 'POST', url: '/rota/sem/politica' })
		expect(passed.statusCode).toBe(200)
		expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({ tag: 'rbac.unmapped' })
		await shadow.close()

		process.env.RBAC_ENFORCE = 'true'
		const enforced = await buildApp('owner')
		const blocked = await enforced.inject({ method: 'POST', url: '/rota/sem/politica' })
		expect(blocked.statusCode).toBe(403)
		await enforced.close()
	})

	it('não toca em rota que não é da superfície de empresa', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('shared')

		const response = await app.inject({ method: 'GET', url: '/dream-jobs/profile' })

		expect(response.statusCode).toBe(200)
		expect(warn).not.toHaveBeenCalled()
		await app.close()
	})

	/*
	 * A base foi criada antes do RBAC e quase ninguém tem `accessLevel`. Se
	 * ausência deixasse de valer `owner`, virar a chave trancaria todo mundo
	 * fora do próprio dado — o erro irreversível que o shadow existe para evitar.
	 */
	it('quem não tem accessLevel continua podendo tudo', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp(undefined)

		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })

		expect(response.statusCode).toBe(200)
		await app.close()
	})

	/*
	 * O bug que fez o enforcement nascer inerte.
	 *
	 * `resolveRole` procurava `userId`/`uuid`, e o colaborador guarda `userRef`.
	 * Nada casava, `accessLevel` vinha undefined, e undefined vira `owner` por
	 * decisão de projeto — então TODO usuário podia tudo, com a chave ligada.
	 * Descoberto por teste real: uma conta `editor` navegou o produto inteiro
	 * sem esbarrar em nada.
	 */
	it('acha o papel pelo `userRef` como objeto', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('shared', 'userRef')
		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })
		expect(response.statusCode).toBe(403)
		await app.close()
	})

	it('acha o papel pelo `userRef` como caminho', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('shared', 'path')
		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })
		expect(response.statusCode).toBe(403)
		await app.close()
	})

	/* convidado que ainda não aceitou não tem referência: sobra o e-mail */
	it('acha o papel pelo e-mail quando não há referência', async () => {
		process.env.RBAC_ENFORCE = 'true'
		const app = await buildApp('editor', 'email')
		const response = await app.inject({ method: 'DELETE', url: '/companies/jobs/j1' })
		expect(response.statusCode).toBe(403)
		await app.close()
	})
})
