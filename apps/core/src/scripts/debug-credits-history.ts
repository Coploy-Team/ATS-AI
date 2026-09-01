/**
 * Diagnóstico do 400 em `/companies/billing/credits-history`.
 *
 * O serializer do Fastify recusa a resposta mas só devolve "Response
 * validation error" — sem dizer o campo. Este script lê os registros reais e
 * roda o MESMO schema, imprimindo o caminho exato que falha.
 *
 * Rodar: npx tsx src/scripts/debug-credits-history.ts <companyId>
 */
import { z } from 'zod'

import { getInfra, initializeInfra } from '../lib/init'

const itemSchema = z.object({
	id: z.string(),
	companyOwner: z.string().nullable().optional(),
	debitedFrom: z.string().nullable().optional(),
	feature: z.string().nullable().optional(),
	ip: z.string().nullable().optional(),
	jobApplied: z.string().nullable().optional(),
	postJobId: z.string().nullable().optional(),
	userId: z.string().nullable().optional(),
	source: z.string().nullable().optional(),
	usedAt: z.any(),
	usedBy: z.string().nullable().optional(),
	usedByName: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
	candidateName: z.string().nullable().optional(),
	jobName: z.string().nullable().optional(),
	score: z.union([z.number(), z.string()]).nullable().optional(),
	isHunting: z.union([z.boolean(), z.string()]).nullable().optional(),
	formattedDate: z.string().nullable().optional(),
	formattedFeature: z.string().nullable().optional(),
})

async function main() {
	const companyId = process.argv[2]
	if (!companyId) throw new Error('uso: debug-credits-history.ts <companyId>')

	await initializeInfra()
	const infra = getInfra()

	const rows = (await infra.billingRepository.listCreditsUsed(companyId, {
		orderByField: 'usedAt',
		orderDirection: 'desc',
		limitTo: 50,
	})) as unknown as Array<Record<string, unknown>>

	console.log(`registros: ${rows.length}`)

	const tipos = new Map<string, Set<string>>()
	for (const row of rows) {
		for (const [key, value] of Object.entries(row)) {
			if (!tipos.has(key)) tipos.set(key, new Set())
			tipos
				.get(key)!
				.add(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)
		}
	}
	console.log('\ntipos por campo:')
	for (const [key, set] of tipos) console.log(`  ${key}: ${[...set].join(' | ')}`)

	console.log('\nvalidação item a item:')
	let falhas = 0
	for (const row of rows) {
		const parsed = itemSchema.safeParse(row)
		if (!parsed.success) {
			falhas++
			if (falhas <= 3) {
				console.log(`  ✗ ${String(row.id)}`)
				for (const issue of parsed.error.issues) {
					console.log(`     ${issue.path.join('.')}: ${issue.message}`)
				}
			}
		}
	}
	console.log(falhas === 0 ? '  todos passam' : `  ${falhas} registro(s) falham`)
	process.exit(0)
}

main().catch((error) => {
	console.error('falhou:', error)
	process.exit(1)
})
