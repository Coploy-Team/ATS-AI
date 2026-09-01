/**
 * Cobertura de RBAC: toda rota de empresa tem política?
 *
 * O contrato público  já é a lista canônica do que a superfície
 * `empresa` expõe. Este script cruza essa lista com a tabela de políticas e
 * falha quando os dois discordam — nos DOIS sentidos:
 *
 * - rota no contrato e fora da tabela → alguém publicou endpoint sem dizer
 *   quem pode chamar. É o modo de falha que importa, e é como a primeira leva
 *   de RBAC parou em 22 de 162 rotas sem ninguém perceber.
 * - entrada na tabela sem rota no contrato → política órfã, resquício de rota
 *   removida ou renomeada. Não é risco, é sujeira que faz a tabela mentir
 *   sobre o tamanho da cobertura.
 *
 * Rodar `npm run check:public-contract` antes deixa o artefato em dia; aqui só
 * lemos o que está commitado.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ROUTE_CAPABILITIES } from '@/http/policy/route-capabilities'

const CONTRACT = resolve(process.cwd(), 'openapi.public.json')
const METHODS = ['get', 'post', 'put', 'patch', 'delete']

interface Operation {
	'x-surface'?: string
}

function contractRoutes(): string[] {
	const spec = JSON.parse(readFileSync(CONTRACT, 'utf8')) as {
		paths: Record<string, Record<string, Operation>>
	}
	const keys: string[] = []
	for (const [path, operations] of Object.entries(spec.paths)) {
		for (const [method, operation] of Object.entries(operations)) {
			if (!METHODS.includes(method)) continue
			if (operation['x-surface'] !== 'empresa') continue
			keys.push(`${method.toUpperCase()} ${path}`)
		}
	}
	return keys.sort()
}

function main() {
	const routes = contractRoutes()
	const mapped = new Set(Object.keys(ROUTE_CAPABILITIES))

	const missing = routes.filter((key) => !mapped.has(key))
	const orphans = [...mapped].filter((key) => !routes.includes(key)).sort()

	if (missing.length === 0 && orphans.length === 0) {
		console.info(`✓ RBAC: ${routes.length} rotas de empresa, todas com política`)
		return
	}

	if (missing.length > 0) {
		console.error(`\n✗ ${missing.length} rota(s) de empresa SEM política:\n`)
		for (const key of missing) console.error(`  ${key}`)
		console.error(
			'\nAdicione em src/http/policy/route-capabilities.ts. Sem entrada, a rota' +
				'\ncai no ramo `unmapped`: logada agora, bloqueada quando RBAC_ENFORCE=true.',
		)
	}

	if (orphans.length > 0) {
		console.error(`\n✗ ${orphans.length} política(s) sem rota correspondente:\n`)
		for (const key of orphans) console.error(`  ${key}`)
		console.error('\nA rota saiu do contrato ou mudou de caminho. Remova ou corrija a chave.')
	}

	process.exit(1)
}

main()
