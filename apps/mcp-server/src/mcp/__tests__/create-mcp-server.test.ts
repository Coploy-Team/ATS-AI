jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		CORE_BASE_URL: 'http://core.test',
		/* com barra no fim de propósito: a tool tem que normalizar */
		CANDIDATE_APP_URL: 'https://candidate.coploy.io/',
	},
}))

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { createMcpServer, type McpServerDeps } from '../create-mcp-server'

function deps(overrides: Partial<McpServerDeps> = {}): McpServerDeps {
	return {
		publicJobsService: {} as McpServerDeps['publicJobsService'],
		candidateAuthService: {
			getUserLanguage: jest.fn().mockResolvedValue('pt-BR'),
		} as unknown as McpServerDeps['candidateAuthService'],
		interviewsService: {
			getInsights: jest.fn(),
			listMyInterviews: jest.fn(),
		} as unknown as McpServerDeps['interviewsService'],
		profileService: {} as McpServerDeps['profileService'],
		...overrides,
	}
}

/** Sobe servidor+cliente ligados em memória: exercita o protocolo de verdade. */
async function connect(serverDeps: McpServerDeps) {
	const server = createMcpServer(serverDeps)
	const client = new Client({ name: 'test', version: '1.0.0' })
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	return client
}

describe('create-mcp-server', () => {
	describe('roteiro de condução', () => {
		it('entrega instructions no initialize (é o que faz o assistente conduzir)', async () => {
			const client = await connect(deps())

			const instructions = client.getInstructions()

			expect(instructions).toBeTruthy()
			// o erro de negócio que já cometemos uma vez: falar em "candidatar-se"
			expect(instructions).not.toMatch(/\bapply to\b/i)
			expect(instructions).toMatch(/do NOT "apply"/)
			// as duas portas e o anti-formulário são a espinha do roteiro
			expect(instructions).toMatch(/search_jobs/)
			expect(instructions).toMatch(/import_profile/)
			expect(instructions).toMatch(/never interrogate/i)
		})

		it('trava a confusão de identidade: só existe o perfil conectado', async () => {
			const client = await connect(deps())

			const instructions = client.getInstructions() ?? ''

			// no teste real ele viu nome diferente e passou a montar currículo
			// "do Heitor", em terceira pessoa, dentro da conta de quem falava
			expect(instructions).toMatch(/third party/i)
			expect(instructions).toMatch(/third person/i)
			expect(instructions).toMatch(/never ask which profile to use/i)
		})

		it('proíbe entregar veredito e manda fechar o ciclo com coaching', async () => {
			const client = await connect(deps())

			const instructions = client.getInstructions() ?? ''

			// o número existe no dado do recrutador; o chat não pode traduzi-lo
			expect(instructions).toMatch(/NEVER hand out a verdict/)
			expect(instructions).toMatch(/get_my_insights/)
			expect(instructions).toMatch(/rehearse/i)
		})
	})

	describe('get_my_profile', () => {
		const overview = {
			profile: { id: 'u1', occupation: 'Dev' },
			missingFields: ['experiences', 'education', 'languages', 'headline'],
			completeness: 66,
			interview: { hasInterview: false, status: 'not_started' },
			nextStep: 'complete_profile',
		}

		async function readProfile() {
			const profileService = {
				getOverview: jest.fn().mockResolvedValue(overview),
			} as unknown as McpServerDeps['profileService']
			const client = await connect(deps({ authenticatedUid: 'u1', profileService }))
			const result = (await client.callTool({ name: 'get_my_profile', arguments: {} })) as {
				content: Array<{ text: string }>
			}
			return JSON.parse(result.content[0].text)
		}

		it('expõe só as duas que pesam — nomear o resto é o que virava checklist', async () => {
			const payload = await readProfile()

			expect(payload.askAbout).toEqual(['experiences', 'education'])
			// contagem em vez de nomes: dá pra dizer "faltam mais alguns detalhes"
			expect(payload.remainingCount).toBe(2)
			// nenhum caminho devolve os nomes restantes — pedir pra não ler não bastou
			expect(JSON.stringify(payload)).not.toMatch(/languages|headline/)
		})

		it('mantém completude e próximo passo, que são o que guia a conversa', async () => {
			const payload = await readProfile()

			expect(payload.completeness).toBe(66)
			expect(payload.nextStep).toBe('complete_profile')
		})

		it('sinaliza o form no payload — em prosa o modelo ignorava', async () => {
			expect((await readProfile()).offerForm).toBe(true)
		})

		it('não oferece form quando não falta nada', async () => {
			const profileService = {
				getOverview: jest.fn().mockResolvedValue({ ...overview, missingFields: [], completeness: 100 }),
			} as unknown as McpServerDeps['profileService']
			const client = await connect(deps({ authenticatedUid: 'u1', profileService }))

			const result = (await client.callTool({ name: 'get_my_profile', arguments: {} })) as {
				content: Array<{ text: string }>
			}

			expect(JSON.parse(result.content[0].text)).toMatchObject({ offerForm: false, askAbout: [] })
		})
	})

	describe('mensagens prontas', () => {
		it('anônimo enxerga só a porta de descoberta', async () => {
			const client = await connect(deps())

			const names = (await client.listPrompts()).prompts.map((p) => p.name)

			expect(names).toEqual(['find_jobs'])
		})

		it('autenticado ganha os atalhos de conta', async () => {
			const client = await connect(deps({ authenticatedUid: 'u1' }))

			const names = (await client.listPrompts()).prompts.map((p) => p.name)

			expect(names).toEqual([
				'find_jobs',
				'build_my_profile',
				'profile_interview',
				'my_insights',
				'my_interviews',
			])
		})

		it('usa o cargo informado no atalho de busca', async () => {
			const client = await connect(deps())

			const result = await client.getPrompt({ name: 'find_jobs', arguments: { role: 'product manager' } })

			expect(result.messages[0].content).toMatchObject({
				type: 'text',
				text: 'Quero ver vagas de product manager na Coploy.',
			})
		})

		it('fala o idioma do perfil do candidato', async () => {
			const candidateAuthService = {
				getUserLanguage: jest.fn().mockResolvedValue('en-US'),
			} as unknown as McpServerDeps['candidateAuthService']
			const client = await connect(deps({ authenticatedUid: 'u1', candidateAuthService }))

			const result = await client.getPrompt({ name: 'build_my_profile' })

			expect((result.messages[0].content as { text: string }).text).toMatch(/build my Coploy résumé/)
		})

		it('o atalho de currículo pede o caminho conversacional, não o formulário', async () => {
			const client = await connect(deps({ authenticatedUid: 'u1' }))

			const text = (
				(await client.getPrompt({ name: 'build_my_profile' })).messages[0].content as { text: string }
			).text

			expect(text).toMatch(/de uma vez|CV/)
			expect(text).toMatch(/pergunta por pergunta/)
		})
	})
})

/*
 * A tool existe para o assistente PARAR de prometer o que não consegue: o
 * arquivo do currículo não trafega pelo MCP, só o texto extraído dele.
 */
describe('o arquivo do currículo', () => {
	it('a tool existe e diz onde subir', async () => {
		const client = await connect(deps({ authenticatedUid: 'u1' }))

		const result = (await client.callTool({
			name: 'get_resume_upload_link',
			arguments: {},
		})) as { content: Array<{ text: string }> }

		const payload = JSON.parse(result.content[0].text) as {
			uploadUrl: string
			why: string
		}
		expect(payload.uploadUrl).toMatch(/\/profile$/)
		expect(payload.uploadUrl).not.toMatch(/\/\/profile/)
		expect(payload.why).toMatch(/cannot travel through this chat/)
	})

	/* Sem sessão não há para onde mandar — a tool é de conta, como as outras. */
	it('não aparece para quem não conectou a conta', async () => {
		const client = await connect(deps({ authenticatedUid: null }))
		const { tools } = await client.listTools()
		expect(tools.map((t) => t.name)).not.toContain('get_resume_upload_link')
	})

	it('a descrição proíbe dizer que recebeu o anexo', async () => {
		const client = await connect(deps({ authenticatedUid: 'u1' }))
		const { tools } = await client.listTools()
		const tool = tools.find((t) => t.name === 'get_resume_upload_link')
		expect(tool?.description).toMatch(/never claim to have received or stored an attachment/)
	})
})
