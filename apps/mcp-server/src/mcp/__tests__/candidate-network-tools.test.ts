jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		CORE_BASE_URL: 'http://core.test',
		CANDIDATE_APP_URL: 'https://candidate.coploy.io/',
	},
}))

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import type { CandidateNetworkService } from '@/lib/services/candidate-network-service'
import { createMcpServer, type McpServerDeps } from '../create-mcp-server'

const NETWORK_TOOLS = [
	'get_my_projects', 'add_project', 'update_project', 'remove_project', 'reorder_projects',
	'get_my_public_profile', 'set_public_profile_handle', 'set_public_profile_availability',
	'publish_public_profile_item', 'remove_public_profile_item', 'revoke_public_profile',
	'list_interview_answers', 'get_my_showcase', 'publish_showcase', 'revoke_showcase',
	'list_my_attestations', 'issue_attestation', 'revoke_attestation', 'export_my_profile',
]

function network(overrides: Partial<Record<keyof CandidateNetworkService, unknown>> = {}) {
	const okv = (data: unknown) => jest.fn().mockResolvedValue({ ok: true, data })
	return {
		publicUrlFor: (handle: string | null) => (handle ? `https://candidate.coploy.io/@${handle}` : null),
		listProjects: okv({ projects: [] }),
		createProject: okv({ project: { id: 'p1', title: 'App' } }),
		updateProject: okv({ project: { id: 'p1', title: 'App 2' } }),
		deleteProject: okv({ deleted: true }),
		reorderProjects: okv({ projects: [] }),
		getPublicProfile: okv({ handle: 'ana', availability: 'available', items: [], revokedAt: null, consentVersion: '2026-09-v1' }),
		checkHandle: okv({ available: true, reason: null }),
		setHandle: okv({ handle: 'ana', availability: 'hidden', items: [], revokedAt: null, consentVersion: '2026-09-v1' }),
		setAvailability: okv({ handle: 'ana', availability: 'available', items: [], revokedAt: null, consentVersion: '2026-09-v1' }),
		publishItem: okv({
			handle: 'ana', availability: 'available', revokedAt: null, consentVersion: '2026-09-v1',
			items: [{ id: 'i1', type: 'link', url: 'https://github.com/ana', withFeedback: false, publishedAt: 'x', moderation: { state: 'pending', reasons: ['link_unreachable'], caseId: 'c1', updatedAt: 'x' } }],
		}),
		removeItem: okv({ ok: true }),
		revokePublicProfile: okv({ ok: true }),
		getShowcase: okv({ showcase: null }),
		listAnswers: okv({ answers: [{ id: 'a1', question: 'Q', videoUrl: 'https://v', answer: 'A', feedback: 'F', strengths: ['s'], improvement: ['i'], score: 9 }] }),
		publishShowcase: okv({ showcase: { token: 't', url: 'https://candidate.coploy.io/v/t', items: [] } }),
		revokeShowcase: okv({ revoked: true }),
		listAttestations: okv({ attestations: [] }),
		issueAttestation: okv({ jti: 'j1', tier: 'summary' }),
		revokeAttestation: okv({ jti: 'j1', status: 'revoked' }),
		exportProfile: okv({ otsVersion: '0.1', exportedAt: 'x', profile: {} }),
		...overrides,
	} as unknown as CandidateNetworkService
}

function deps(overrides: Partial<McpServerDeps> = {}): McpServerDeps {
	return {
		publicJobsService: {} as McpServerDeps['publicJobsService'],
		candidateAuthService: { getUserLanguage: jest.fn().mockResolvedValue('pt-BR') } as unknown as McpServerDeps['candidateAuthService'],
		interviewsService: {} as McpServerDeps['interviewsService'],
		profileService: {} as McpServerDeps['profileService'],
		networkService: network(),
		authenticatedUid: 'u1',
		features: { motor: true, candidateApp: true },
		...overrides,
	}
}

async function connect(serverDeps: McpServerDeps) {
	const server = createMcpServer(serverDeps)
	const client = new Client({ name: 'test', version: '1.0.0' })
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
	const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
	return { payload: JSON.parse(result.content[0].text) as Record<string, unknown>, isError: result.isError === true }
}

describe('a rede do candidato no MCP (COP-22 / COP-12)', () => {
	it('as tools existem só com conta conectada', async () => {
		const anon = await connect(deps({ authenticatedUid: undefined }))
		const anonNames = (await anon.listTools()).tools.map((t) => t.name)
		for (const name of NETWORK_TOOLS) expect(anonNames).not.toContain(name)

		const auth = await connect(deps())
		const names = (await auth.listTools()).tools.map((t) => t.name)
		for (const name of NETWORK_TOOLS) expect(names).toContain(name)
	})

	it('o atalho de publicar só aparece onde a rede existe', async () => {
		const withNetwork = (await (await connect(deps())).listPrompts()).prompts.map((p) => p.name)
		expect(withNetwork).toContain('publish_my_profile')
		const without = (await (await connect(deps({ features: { motor: true, candidateApp: false } }))).listPrompts()).prompts.map((p) => p.name)
		expect(without).not.toContain('publish_my_profile')
	})

	it('instalação sem a rede do candidato: a tool explica em vez de dar 404', async () => {
		const client = await connect(deps({ features: { motor: false, candidateApp: false } }))
		const { payload, isError } = await call(client, 'get_my_projects')
		expect(isError).toBe(true)
		expect(payload.error).toBe('candidate_network_not_available')
		// prova OTS e exportação são do core aberto: continuam funcionando
		expect((await call(client, 'export_my_profile')).isError).toBe(false)
		expect((await call(client, 'list_my_attestations')).isError).toBe(false)
	})

	it('publicar sem o sim explícito não chama o core — consentimento é ato da pessoa', async () => {
		const net = network()
		const client = await connect(deps({ networkService: net }))
		const { payload, isError } = await call(client, 'publish_public_profile_item', { type: 'profile', accepted: false })
		expect(isError).toBe(true)
		expect(payload.error).toBe('consent_required')
		expect(net.publishItem).not.toHaveBeenCalled()

		const showcase = await call(client, 'publish_showcase', { items: [{ jobAppliedId: 'j', answerId: 'a' }], accepted: false })
		expect(showcase.payload.error).toBe('consent_required')
		const proof = await call(client, 'issue_attestation', { jobAppliedId: 'j', tier: 'summary', accepted: false })
		expect(proof.payload.error).toBe('consent_required')
	})

	it('publicar com o sim passa pela curadoria e devolve o estado explicado', async () => {
		const net = network()
		const client = await connect(deps({ networkService: net }))
		const { payload, isError } = await call(client, 'publish_public_profile_item', { type: 'link', url: 'https://github.com/ana', accepted: true })
		expect(isError).toBe(false)
		expect(net.publishItem).toHaveBeenCalledWith('u1', { type: 'link', url: 'https://github.com/ana' })
		expect((payload.item as { moderation: { state: string } }).moderation.state).toBe('pending')
		expect(payload.curation).toMatch(/Em análise/)
		expect(payload.curation).toMatch(/não é uma recusa/)
	})

	it('o perfil aberto vem com o resumo do consentimento e o endereço público', async () => {
		const client = await connect(deps())
		const { payload } = await call(client, 'get_my_public_profile')
		expect(payload.publicUrl).toBe('https://candidate.coploy.io/@ana')
		expect((payload.consent as { version: string; summary: string }).version).toBe('2026-09-v1')
		expect((payload.consent as { summary: string }).summary).toMatch(/curadoria/)
		// nunca promete a empresa
		expect((payload.consent as { summary: string }).summary).toMatch(/sem identificar a empresa/)
	})

	it('handle indisponível explica o motivo em vez de gravar', async () => {
		const net = network({ checkHandle: jest.fn().mockResolvedValue({ ok: true, data: { available: false, reason: 'taken' } }) })
		const client = await connect(deps({ networkService: net }))
		const { payload } = await call(client, 'set_public_profile_handle', { handle: 'ana' })
		expect(payload).toEqual({ available: false, reason: 'taken' })
		expect(net.setHandle).not.toHaveBeenCalled()
	})

	it('as respostas da entrevista saem sem nota — o veredito é do recrutador', async () => {
		const client = await connect(deps())
		const { payload } = await call(client, 'list_interview_answers', { jobAppliedId: 'j1' })
		const answer = (payload.answers as Array<Record<string, unknown>>)[0]
		expect(answer).toEqual(expect.objectContaining({ id: 'a1', hasVideo: true, feedback: 'F', strengths: ['s'] }))
		expect(answer).not.toHaveProperty('score')
		expect(answer).not.toHaveProperty('videoUrl')
	})

	it('as tools que tiram do ar são marcadas como destrutivas para o host pedir confirmação', async () => {
		const client = await connect(deps())
		const { tools } = await client.listTools()
		for (const name of ['remove_project', 'remove_public_profile_item', 'revoke_public_profile', 'revoke_showcase', 'revoke_attestation']) {
			expect(tools.find((t) => t.name === name)?.annotations?.destructiveHint).toBe(true)
		}
		expect(tools.find((t) => t.name === 'publish_public_profile_item')?.annotations?.destructiveHint).toBe(false)
	})

	it('o roteiro manda ler o consentimento antes e diz que não há IA dentro do app', async () => {
		const client = await connect(deps())
		const instructions = client.getInstructions() ?? ''
		expect(instructions).toMatch(/PUBLISHING IS THE PERSON'S ACT/)
		expect(instructions).toMatch(/Never pass accepted: true on your own initiative/)
		expect(instructions).toMatch(/NO AI INSIDE THE APP/)
	})
})
