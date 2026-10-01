/**
 * Migration idempotente: normaliza subscriptionStatus 'trial' → 'trialing' (valor Stripe canonical).
 *
 * Usage: tsx src/scripts/migrate-trial-to-trialing.ts
 *
 * Seguro para reexecutar — empresas já em 'trialing' não são tocadas.
 * Roda apenas no GCP (Firestore). Selfhosted não usa 'trial'.
 */
import { initializeInfra } from '@/lib/init'

async function run() {
	const infra = await initializeInfra()

	const byRootField = await infra.companyRepository.listCompanies({
		filters: [{ field: 'subscriptionStatus', operator: '==', value: 'trial' }],
	})

	const byDetailsField = await infra.companyRepository.listCompanies({
		filters: [{ field: 'subscriptionDetails.status', operator: '==', value: 'trial' }],
	})

	const seen = new Set<string>()
	const companies = [...byRootField, ...byDetailsField].filter((c) => {
		if (seen.has(c.id)) return false
		seen.add(c.id)
		return true
	})

	if (companies.length === 0) {
		console.log('[migrate-trial] Nenhuma empresa com status=trial encontrada. Nada a fazer.')
		process.exit(0)
	}

	console.log(`[migrate-trial] ${companies.length} empresa(s) para migrar...`)

	type UpdateData = Parameters<typeof infra.companyRepository.updateCompany>[1]

	for (const company of companies) {
		const update: Record<string, unknown> = {}

		if (
			(company as any).subscriptionStatus === 'trial' ||
			(company as any).subscriptionDetails?.status === 'trial'
		) {
			if ((company as any).subscriptionStatus === 'trial') {
				update.subscriptionStatus = 'trialing'
			}
			if ((company as any).subscriptionDetails?.status === 'trial') {
				update['subscriptionDetails.status'] = 'trialing'
			}

			await infra.companyRepository.updateCompany(company.id, update as unknown as UpdateData)
			console.log(`[migrate-trial] Migrada: ${company.id}`)
		}
	}

	console.log('[migrate-trial] Concluído.')
	process.exit(0)
}

run().catch((err) => {
	console.error('[migrate-trial] Erro:', err)
	process.exit(1)
})
