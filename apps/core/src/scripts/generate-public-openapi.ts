/**
 * Generates the PUBLIC contract artifact `apps/core/openapi.public.json`
 * : only operations whose route schema declares `x-surface`.
 * Fail-closed — anything unmarked is internal.
 *
 * Usage:  tsx src/scripts/generate-public-openapi.ts
 *
 * CI contract check (see package.json `check:public-contract`): regenerate
 * and `git diff --exit-code` — a PR that changes the contract without
 * updating the committed artifact (and bumping PUBLIC_CONTRACT_VERSION on
 * breaking changes) fails the build.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildOpenApiSpec } from './build-openapi-spec'
import { filterPublicSpec, PUBLIC_CONTRACT_VERSION } from './public-contract'

async function main() {
	const fullSpec = await buildOpenApiSpec()
	const { spec, included, excluded, bySurface } = filterPublicSpec(fullSpec)

	const outPath = resolve(__dirname, '../../openapi.public.json')
	writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`)

	console.log(`Public contract v${PUBLIC_CONTRACT_VERSION} written to ${outPath}`)
	console.log(
		`operations: ${included} public / ${excluded} internal — ` +
			`empresa=${bySurface.empresa} candidato=${bySurface.candidato} ` +
			`publico=${bySurface.publico} integracoes=${bySurface.integracoes}`,
	)
	process.exit(0)
}

main().catch((err) => {
	console.error('Failed to generate public contract:', err)
	process.exit(1)
})
