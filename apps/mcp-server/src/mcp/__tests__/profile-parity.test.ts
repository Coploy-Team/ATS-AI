/**
 * Guard de paridade do currículo entre o core e o canal MCP (COP-22).
 *
 * O buraco que motivou: o COP-6 acrescentou quatro campos ao perfil, o core
 * passou a gravar e a contar na completude, e as tools de escrita do MCP não
 * os conheciam — zod descarta chave desconhecida em silêncio, então o
 * assistente perguntava por eles e não conseguia salvar a resposta. Nada
 * falhava. Este teste é o que falha.
 *
 * Lê o schema do core pelo caminho relativo de propósito: é a fonte da
 * verdade do PATCH /dream-jobs/profile, e o MCP não reimplementa contrato.
 */
jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		CORE_BASE_URL: 'http://core.test',
		CANDIDATE_APP_URL: 'https://candidate.coploy.io',
	},
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { candidateProfileWritableSchema } from '../../../../core/src/schemas/candidate-profile-schema'
import { createMcpServer, type McpServerDeps } from '../create-mcp-server'
import {
	AVAILABILITIES,
	PROFILE_FORM_FIELDS,
	PROFILE_FORM_STRINGS,
	PROFILE_WRITE_EXCLUSIONS,
	UPDATE_ONLY_FIELDS,
	WORK_MODALITIES,
} from '../profile-fields'

const CORE_ROOT = join(__dirname, '../../../../core/src')

function deps(): McpServerDeps {
	return {
		publicJobsService: {} as McpServerDeps['publicJobsService'],
		candidateAuthService: {
			getUserLanguage: jest.fn().mockResolvedValue('pt-BR'),
		} as unknown as McpServerDeps['candidateAuthService'],
		interviewsService: {} as McpServerDeps['interviewsService'],
		profileService: {} as McpServerDeps['profileService'],
		authenticatedUid: 'u1',
	}
}

async function toolInputs(): Promise<Record<string, string[]>> {
	const server = createMcpServer(deps())
	const client = new Client({ name: 'test', version: '1.0.0' })
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	const { tools } = await client.listTools()
	return Object.fromEntries(
		tools.map((tool) => [
			tool.name,
			Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}),
		]),
	)
}

/**
 * Os campos que pesam na completude do core, lidos do fonte do service: a
 * constante não é exportada, e importar o service inteiro traria a infra.
 * É esta lista que vira `missingFields` — e cada item dela precisa de uma
 * entrada no formulário, senão o assistente conta seis e o widget mostra duas.
 */
function coreWeightedFields(): string[] {
	const source = readFileSync(join(CORE_ROOT, 'lib/services/candidate-profile-service.ts'), 'utf8')
	const block = source.slice(source.indexOf('COMPLETENESS_WEIGHTS'), source.indexOf(']', source.indexOf('COMPLETENESS_WEIGHTS')))
	const fields = [...block.matchAll(/field:\s*'([a-zA-Z]+)'/g)].map((m) => m[1])
	expect(fields.length).toBeGreaterThan(5)
	return fields
}

describe('paridade do currículo: core ↔ MCP', () => {
	const writable = Object.keys(candidateProfileWritableSchema.shape)

	it('todo campo gravável por PATCH é gravável pelo assistente, ou está excluído com motivo', async () => {
		const inputs = await toolInputs()
		const reachable = new Set([...inputs.update_my_profile, ...inputs.import_profile])

		const unreachable = writable.filter((f) => !reachable.has(f) && !(f in PROFILE_WRITE_EXCLUSIONS))
		expect(unreachable).toEqual([])
	})

	it('a lista de exclusão não guarda campo que o core já não aceita (exclusão morta)', () => {
		for (const field of Object.keys(PROFILE_WRITE_EXCLUSIONS)) {
			expect(writable).toContain(field)
			expect(PROFILE_WRITE_EXCLUSIONS[field].length).toBeGreaterThan(20)
		}
	})

	it('as tools não inventam campo que o core descartaria em silêncio', async () => {
		const inputs = await toolInputs()
		for (const tool of ['update_my_profile', 'import_profile'] as const) {
			const invented = inputs[tool].filter((f) => !writable.includes(f))
			expect({ tool, invented }).toEqual({ tool, invented: [] })
		}
	})

	it('import_profile cobre tudo que update_my_profile cobre, menos identidade/contato', async () => {
		const inputs = await toolInputs()
		const missingInImport = inputs.update_my_profile.filter(
			(f) => !inputs.import_profile.includes(f) && !(UPDATE_ONLY_FIELDS as readonly string[]).includes(f),
		)
		expect(missingInImport).toEqual([])
	})

	it('o nome que as instructions prometem corrigir existe na tool', async () => {
		const inputs = await toolInputs()
		expect(inputs.update_my_profile).toContain('name')
	})

	it('todo campo que o core pode devolver em missingFields tem entrada no formulário, nas duas línguas', () => {
		for (const field of coreWeightedFields()) {
			expect(PROFILE_FORM_FIELDS).toHaveProperty(field)
			expect(PROFILE_FORM_STRINGS['pt-BR']).toHaveProperty(field)
			expect(PROFILE_FORM_STRINGS.en).toHaveProperty(field)
		}
	})

	it('select e múltipla escolha rotulam cada valor aceito, nas duas línguas', () => {
		for (const [field, spec] of Object.entries(PROFILE_FORM_FIELDS)) {
			if (!spec.values) continue
			for (const lang of ['pt-BR', 'en'] as const) {
				for (const value of spec.values) {
					expect(PROFILE_FORM_STRINGS[lang][field].options).toHaveProperty(value)
				}
			}
		}
	})

	it('o vocabulário fechado é o mesmo da área do candidato', () => {
		// PersonalInfoTab: botões de modalidade e select de disponibilidade
		expect([...WORK_MODALITIES]).toEqual(['remote', 'hybrid', 'onsite'])
		expect([...AVAILABILITIES]).toEqual(['immediate', '15_days', '30_days', 'negotiable'])
		// o core limita a três modalidades — a enum não pode ter mais valores que isso
		expect(WORK_MODALITIES.length).toBeLessThanOrEqual(3)
	})
})
