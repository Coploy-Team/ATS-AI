/**
 * Generates the FULL OpenAPI JSON spec from the Fastify app (internal, no
 * stability commitment — dashboard/admin tooling consume this one).
 *
 * Usage:  tsx src/scripts/generate-openapi.ts
 * Output: apps/core/openapi.json
 *
 * For the public contract artifact see generate-public-openapi.ts.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildOpenApiSpec } from './build-openapi-spec'

async function main() {
	const spec = await buildOpenApiSpec()
	const outPath = resolve(__dirname, '../../openapi.json')
	writeFileSync(outPath, JSON.stringify(spec, null, 2))
	console.log(`OpenAPI spec written to ${outPath}`)
	process.exit(0)
}

main().catch((err) => {
	console.error('Failed to generate OpenAPI spec:', err)
	process.exit(1)
})
