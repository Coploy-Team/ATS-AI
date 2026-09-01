import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROUTES_DIR = join(__dirname, '..')

/**
 * `createAuth` é um middleware **lazy**: ele só instala `getCurrentUser` /
 * `getUserMembership` / `getAccessToken` no request. Quem nunca chama nenhum
 * deles NÃO é autenticado — a rota responde 200 sem token, mesmo declarando
 * `security: [{ bearerAuth: [] }]` no schema.
 *
 * Isso já mordeu três vezes (`POST /send-email`, as rotas de
 * `conversation-context`, e a leva de `settings/*` + `dashboard/retro`
 * encontrada em 2026-08-15, que expunha token da Gupy e webhook de outros
 * tenants). Registrar o middleware dá falsa sensação de proteção, então o
 * teste trava a regressão em vez de confiar em revisão.
 *
 * Rota que precisa ser pública entra na allowlist COM justificativa.
 */
const PUBLIC_BY_DESIGN = new Set([
	// O candidato responde o NPS na tela de agradecimento do `web/interview`,
	// sem sessão de empresa. Já não registra `createAuth`; fica aqui como
	// documentação de que a decisão é consciente.
	'feedback/create-nps.ts',
])

function walk(dir: string, prefix = ''): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		const rel = prefix ? `${prefix}/${entry}` : entry
		if (statSync(full).isDirectory()) {
			return entry === '__tests__' ? [] : walk(full, rel)
		}
		return entry.endsWith('.ts') ? [rel] : []
	})
}

describe('guarda contra auth lazy nunca invocada', () => {
	const offenders = walk(ROUTES_DIR)
		.filter((rel) => !rel.startsWith('middlewares/'))
		.filter((rel) => !PUBLIC_BY_DESIGN.has(rel))
		.filter((rel) => {
			const source = readFileSync(join(ROUTES_DIR, rel), 'utf8')
			if (!source.includes('createAuth(')) return false
			return !/getUserMembership|getCurrentUser|getAccessToken/.test(source)
		})

	it('nenhuma rota registra createAuth sem chamar os helpers', () => {
		expect(offenders).toEqual([])
	})
})
