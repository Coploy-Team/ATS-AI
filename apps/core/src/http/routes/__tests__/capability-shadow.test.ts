import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CAPABILITIES, can, capabilitiesOf, normalizeTenantRole } from '@coploy/domain'

import {
	ROUTE_CAPABILITIES,
	capabilityFor,
	toContractPath,
} from '@/http/policy/route-capabilities'

/**
 * Trava as duas decisões que, se mudarem sem querer, trancam clientes fora do
 * próprio dado (V2-301) — e, desde V2-302, a cobertura da política.
 */
describe('RBAC de tenant', () => {
	it('trata accessLevel ausente como owner — a base foi criada antes do RBAC', () => {
		expect(normalizeTenantRole(undefined)).toBe('owner')
		expect(normalizeTenantRole(null)).toBe('owner')
		expect(normalizeTenantRole('')).toBe('owner')
		expect(normalizeTenantRole('papel-que-nao-existe')).toBe('owner')
	})

	it('normaliza papéis conhecidos, ignorando caixa e espaço', () => {
		expect(normalizeTenantRole('Editor')).toBe('editor')
		expect(normalizeTenantRole('  shared ')).toBe('shared')
	})

	it('editor opera o dia a dia mas não mexe em dinheiro nem em acesso', () => {
		expect(can('editor', 'candidate:move')).toBe(true)
		expect(can('editor', 'job:write')).toBe(true)
		expect(can('editor', 'billing:write')).toBe(false)
		expect(can('editor', 'team:write')).toBe(false)
	})

	it('shared não escreve nada — nem gasta crédito de quem o convidou', () => {
		const writes = capabilitiesOf('shared').filter((c) => c.endsWith(':write'))
		expect(writes).toEqual([])
		// as duas que custam dinheiro, explicitamente
		expect(can('shared', 'ai:use')).toBe(false)
		expect(can('shared', 'candidate:unlock')).toBe(false)
		// e o banco de talentos inteiro não é dele
		expect(can('shared', 'talent:read')).toBe(false)
	})

	it('todo papel é membro do tenant', () => {
		expect(can('owner', 'tenant:member')).toBe(true)
		expect(can('editor', 'tenant:member')).toBe(true)
		expect(can('shared', 'tenant:member')).toBe(true)
	})

	it('owner tem tudo', () => {
		expect(capabilitiesOf('owner').length).toBeGreaterThan(capabilitiesOf('editor').length)
	})
})

describe('política de rotas', () => {
	const CONTRACT = resolve(__dirname, '../../../../openapi.public.json')

	function empresaRoutes(): string[] {
		const spec = JSON.parse(readFileSync(CONTRACT, 'utf8')) as {
			paths: Record<string, Record<string, { 'x-surface'?: string }>>
		}
		const keys: string[] = []
		for (const [path, operations] of Object.entries(spec.paths)) {
			for (const [method, operation] of Object.entries(operations)) {
				if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
				if (operation['x-surface'] !== 'empresa') continue
				keys.push(`${method.toUpperCase()} ${path}`)
			}
		}
		return keys
	}

	/*
	 * O teste que importa. Sem ele, uma rota nova entra no contrato sem política
	 * e ninguém percebe — foi exatamente assim que a primeira leva parou em 22
	 * de 162 rotas.
	 */
	it('cobre toda rota de empresa do contrato público', () => {
		const missing = empresaRoutes().filter((key) => !(key in ROUTE_CAPABILITIES))
		expect(missing).toEqual([])
	})

	it('não guarda política órfã — chave sem rota faz a tabela mentir', () => {
		const routes = new Set(empresaRoutes())
		const orphans = Object.keys(ROUTE_CAPABILITIES).filter((key) => !routes.has(key))
		expect(orphans).toEqual([])
	})

	it('só usa capabilities que existem', () => {
		const known = new Set<string>(CAPABILITIES)
		const unknown = Object.values(ROUTE_CAPABILITIES).filter((c) => !known.has(c))
		expect(unknown).toEqual([])
	})

	it('converte o caminho do Fastify para a forma do contrato', () => {
		expect(toContractPath('/companies/jobs/:jobId/candidates')).toBe(
			'/companies/jobs/{jobId}/candidates',
		)
		expect(toContractPath('/companies/jobs')).toBe('/companies/jobs')
	})

	it('resolve a capability a partir do método e do caminho da rota', () => {
		expect(capabilityFor('GET', '/companies/jobs')).toBe('job:read')
		expect(capabilityFor('delete', '/companies/jobs/:jobId')).toBe('job:delete')
		expect(capabilityFor('GET', '/rota/que/nao/existe')).toBeUndefined()
	})

	/*
	 * Escrita destrutiva e gasto de crédito nunca podem cair num nível que o
	 * convidado de revisão tem. É a regressão mais cara possível nesta tabela,
	 * porque passa despercebida até alguém apagar dado de candidato.
	 */
	it('mantém as ações caras fora do alcance de shared', () => {
		const dangerous = [
			'DELETE /companies/jobs/{jobId}',
			'POST /settings/privacy/anonymize',
			'POST /companies/billing/checkout',
			'POST /ia/job-description',
			'POST /companies/interviews/{userId}/{jobAppliedId}/fast-track',
			'POST /companies/collaborators',
		]
		for (const key of dangerous) {
			const capability = ROUTE_CAPABILITIES[key]
			expect(capability).toBeDefined()
			expect(can('shared', capability)).toBe(false)
		}
	})
})
