/**
 * Instalação sem Motor e sem área do candidato (distribuição open, F1.4).
 *
 * As tools não somem: respondem que a instalação não tem aquilo, porque o
 * assistente precisa do motivo para não inventar um — e o próximo passo do
 * perfil para de propor uma entrevista que não existe.
 */
jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: undefined,
		CANDIDATE_APP_URL: undefined,
		CAREERS_BASE_URL: 'http://localhost:8081',
		CORE_BASE_URL: 'http://core.test',
	},
}))

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { installationFeatures } from '@/lib/features'
import { jobEntryUrl } from '@/lib/job-entry-link'
import { createMcpServer, type McpServerDeps } from '../create-mcp-server'

const OPEN = { motor: false, candidateApp: false }

function deps(overrides: Partial<McpServerDeps> = {}): McpServerDeps {
	return {
		publicJobsService: {} as McpServerDeps['publicJobsService'],
		candidateAuthService: {
			getUserLanguage: jest.fn().mockResolvedValue('pt-BR'),
		} as unknown as McpServerDeps['candidateAuthService'],
		interviewsService: {
			startInterview: jest.fn(),
		} as unknown as McpServerDeps['interviewsService'],
		profileService: {
			startProfileInterview: jest.fn(),
			getOverview: jest.fn().mockResolvedValue({
				profile: { occupation: 'Dev', level: 'Pleno' },
				missingFields: [],
				completeness: 100,
				interview: { hasInterview: false, status: 'not_started', interviewUrl: null },
				nextStep: 'start_profile_interview',
			}),
		} as unknown as McpServerDeps['profileService'],
		authenticatedUid: 'u1',
		features: OPEN,
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

type ToolResult = { content: Array<{ text: string }>; isError?: boolean }

describe('instalação sem Motor e sem área do candidato', () => {
	it('a configuração vazia é lida como "não tem"', () => {
		expect(installationFeatures()).toEqual(OPEN)
	})

	it('a vaga aponta para o portal da instância quando não há sala de entrevista', () => {
		expect(jobEntryUrl('j1', 'c1')).toBe('http://localhost:8081/c1/vagas/j1')
	})

	it('start_interview responde que não há motor, sem tocar no orchestrator', async () => {
		const d = deps()
		const client = await connect(d)
		const result = (await client.callTool({
			name: 'start_interview',
			arguments: { companyId: 'c1', jobId: 'j1' },
		})) as ToolResult
		expect(result.isError).toBe(true)
		expect(JSON.parse(result.content[0].text).error).toBe('motor_not_installed')
		expect(d.interviewsService.startInterview).not.toHaveBeenCalled()
	})

	it('start_profile_interview idem', async () => {
		const d = deps()
		const client = await connect(d)
		const result = (await client.callTool({
			name: 'start_profile_interview',
			arguments: { occupation: 'Dev', level: 'Pleno' },
		})) as ToolResult
		expect(result.isError).toBe(true)
		expect(JSON.parse(result.content[0].text).error).toBe('motor_not_installed')
		expect(d.profileService.startProfileInterview).not.toHaveBeenCalled()
	})

	it('get_my_profile não propõe a entrevista de perfil e diz por quê', async () => {
		const client = await connect(deps())
		const result = (await client.callTool({ name: 'get_my_profile', arguments: {} })) as ToolResult
		const payload = JSON.parse(result.content[0].text)
		expect(payload.nextStep).toBe('done')
		expect(payload.motorAvailable).toBe(false)
		expect(payload.motorNote).toMatch(/no interview engine/)
	})

	it('get_resume_upload_link responde que não há área do candidato', async () => {
		const client = await connect(deps())
		const result = (await client.callTool({ name: 'get_resume_upload_link', arguments: {} })) as ToolResult
		expect(result.isError).toBe(true)
		expect(JSON.parse(result.content[0].text).error).toBe('candidate_area_not_available')
	})

	it('o formulário de lacunas não recebe link de upload', async () => {
		const client = await connect(deps())
		const result = (await client.callTool({ name: 'complete_my_profile', arguments: {} })) as {
			structuredContent: { resumeUploadUrl: string | null }
		}
		expect(result.structuredContent.resumeUploadUrl).toBeNull()
	})

	it('com tudo instalado o comportamento de sempre segue', async () => {
		const d = deps({ features: { motor: true, candidateApp: true } })
		;(d.interviewsService.startInterview as jest.Mock).mockResolvedValue({ interviewUrl: 'https://x/i' })
		const client = await connect(d)
		const result = (await client.callTool({
			name: 'start_interview',
			arguments: { companyId: 'c1', jobId: 'j1' },
		})) as ToolResult
		expect(result.isError).toBeFalsy()
		expect(d.interviewsService.startInterview).toHaveBeenCalledWith('u1', 'c1', 'j1')
	})
})
