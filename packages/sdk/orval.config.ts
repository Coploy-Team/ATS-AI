/**
 * Geração do @coploy/sdk a partir do contrato público, por superfície
 * (ADR-003/004). Antes de rodar: `npm run split` popula .orval/.
 *
 * Duas camadas por superfície:
 *  - fetch  → src/generated/<surface>.ts        (framework-agnostic, entry ".")
 *  - hooks  → src/generated/react/<surface>.ts  (TanStack Query, entry "./react")
 * Ambas delegam ao mutator coployFetch (runtime/http.ts).
 */
import { defineConfig } from 'orval'

const SURFACES = ['empresa', 'candidato', 'publico', 'integracoes'] as const

const mutator = {
	path: './src/runtime/http.ts',
	name: 'coployFetch',
}

const fetchProjects = Object.fromEntries(
	SURFACES.map((surface) => [
		surface,
		{
			input: `./.orval/${surface}.json`,
			output: {
				target: `./src/generated/${surface}.ts`,
				client: 'fetch' as const,
				mode: 'single' as const,
				override: { mutator },
			},
		},
	]),
)

const reactProjects = Object.fromEntries(
	SURFACES.map((surface) => [
		`${surface}React`,
		{
			input: `./.orval/${surface}.json`,
			output: {
				target: `./src/generated/react/${surface}.ts`,
				client: 'react-query' as const,
				httpClient: 'fetch' as const,
				mode: 'single' as const,
				override: { mutator },
			},
		},
	]),
)

export default defineConfig({ ...fetchProjects, ...reactProjects })
