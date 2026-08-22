/**
 * Carga da taxonomia (V2-801).
 *
 * Idempotente por id: rodar de novo atualiza, não duplica. Roda fora do caminho
 * de request de propósito — em runtime a taxonomia é **lida**, nunca buscada na
 * rede.
 *
 *   npx tsx src/scripts/load-taxonomy.ts
 */
import { getInfra, initializeInfra } from '../lib/init'
import { SEED_OCCUPATIONS, SEED_SKILLS, TAXONOMY_VERSION } from '../lib/taxonomy/seed'

async function main() {
	await initializeInfra()
	const infra = getInfra()

	const occupations = await infra.taxonomyRepository.upsertOccupations(SEED_OCCUPATIONS)
	const skills = await infra.taxonomyRepository.upsertSkills(SEED_SKILLS)

	console.info(
		`[taxonomy] versão ${TAXONOMY_VERSION}: ${occupations} ocupações, ${skills} skills`,
	)
	process.exit(0)
}

main().catch((error) => {
	console.error('[taxonomy] carga falhou:', error)
	process.exit(1)
})
