/**
 * Contrato público do core — filtro e versão (ADR-003).
 *
 * O contrato é OPT-IN FAIL-CLOSED: só entra no `openapi.public.json` a
 * operação cujo schema declara `x-surface`. Ausência = rota interna, sem
 * exceção. Ver docs/talent-os/v2/contrato-publico-core.md §5.
 *
 * Versionamento (semver PRÓPRIO do contrato, independente do core):
 *  - patch: correção de doc/descrição, sem mudança de shape
 *  - minor: aditivo (rota nova, campo opcional novo em response)
 *  - major: remoção, rename, mudança de tipo, campo obrigatório novo em request
 */

export const PUBLIC_CONTRACT_VERSION = '0.67.0'

export const SURFACES = ['empresa', 'candidato', 'publico', 'integracoes'] as const
export type Surface = (typeof SURFACES)[number]

/** Prefixos que NUNCA podem aparecer no artefato público, marcados ou não. */
const FORBIDDEN_PATH_PREFIXES = ['/admin', '/internal']

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenApiSpec = Record<string, any>

export interface FilterResult {
	spec: OpenApiSpec
	included: number
	excluded: number
	bySurface: Record<Surface, number>
}

export class PublicContractViolation extends Error {}

/**
 * Filtra o spec completo para o artefato público.
 *
 * Guardrails (lançam PublicContractViolation):
 *  - valor de `x-surface` fora do enum
 *  - path `/admin/*` ou `/internal/*` marcado com `x-surface` (cinto e
 *    suspensório: mesmo marcado de propósito, não passa)
 */
export function filterPublicSpec(fullSpec: OpenApiSpec): FilterResult {
	const bySurface: Record<Surface, number> = {
		empresa: 0,
		candidato: 0,
		publico: 0,
		integracoes: 0,
	}
	let included = 0
	let excluded = 0

	const publicPaths: OpenApiSpec = {}
	const paths: OpenApiSpec = fullSpec.paths ?? {}

	for (const path of Object.keys(paths).sort()) {
		const item = paths[path]
		const keptOps: OpenApiSpec = {}

		for (const method of HTTP_METHODS) {
			const op = item[method]
			if (!op) continue
			const surface = op['x-surface']
			if (surface === undefined) {
				excluded++
				continue
			}
			if (!SURFACES.includes(surface)) {
				throw new PublicContractViolation(
					`x-surface inválido em ${method.toUpperCase()} ${path}: ${JSON.stringify(surface)}`,
				)
			}
			if (FORBIDDEN_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
				throw new PublicContractViolation(
					`path proibido marcado com x-surface: ${method.toUpperCase()} ${path}`,
				)
			}
			keptOps[method] = op
			bySurface[surface as Surface]++
			included++
		}

		if (Object.keys(keptOps).length > 0) {
			// preserva chaves não-método do path item (parameters, description)
			const rest: OpenApiSpec = {}
			for (const key of Object.keys(item)) {
				if (!HTTP_METHODS.includes(key as (typeof HTTP_METHODS)[number])) rest[key] = item[key]
			}
			publicPaths[path] = { ...rest, ...keptOps }
		}
	}

	const spec: OpenApiSpec = {
		...fullSpec,
		info: {
			title: 'Coploy Public API',
			description:
				'Contrato público do core (ADR-003). Superfícies: empresa (sessão de empresa), ' +
				'candidato (sessão de candidato), publico (sem auth / token efêmero), ' +
				'integracoes (x-api-key de empresa). Rotas fora deste artefato são internas ' +
				'e podem mudar sem aviso.',
			version: PUBLIC_CONTRACT_VERSION,
		},
		paths: publicPaths,
	}

	return { spec, included, excluded, bySurface }
}
