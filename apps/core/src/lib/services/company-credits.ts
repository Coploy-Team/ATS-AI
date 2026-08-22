import type { InfraProvider } from '@coploy/infra'

type Pair = { id: string | null; jobApplied: string | null }

export function createCompanyCreditsService(infra: InfraProvider) {
	return {
		async getPaidUserIdsForCandidates(
			companyId: string,
			pairs: Pair[],
		): Promise<Set<{ id: string; jobApplied: string }>> {
			// Mantém apenas pares válidos (ambos presentes)
			const validPairs = pairs.filter(
				(p): p is { id: string; jobApplied: string } => !!p.id && !!p.jobApplied,
			)
			if (validPairs.length === 0) return new Set()

			// Mapa: userId -> set de jobApplied pedidos (para filtrar docs)
			const wantedByUser = new Map<string, Set<string>>()
			for (const { id, jobApplied } of validPairs) {
				if (!wantedByUser.has(id)) wantedByUser.set(id, new Set<string>())
				wantedByUser.get(id)!.add(jobApplied)
			}

			// Lista única de userIds para o IN
			const uniqueUserIds = Array.from(wantedByUser.keys())

			const result = new Set<{ id: string; jobApplied: string }>()
			const CHUNK_SIZE = 10
			for (let i = 0; i < uniqueUserIds.length; i += CHUNK_SIZE) {
				const chunkIds = uniqueUserIds.slice(i, i + CHUNK_SIZE)
				if (chunkIds.length === 0) continue

				// Firestore: feature == 'candidate_interview' AND userId IN chunkIds
				const docs = (await infra.billingRepository.listCreditsUsed(companyId, {
					filters: [
						{
							field: 'userId',
							operator: 'in',
							value: chunkIds,
						},
					],
					limitTo: 100,
				})) ?? []

				for (const d of docs) {
					/*
					 * Duas grafias, e o filtro é aqui — não na consulta.
					 *
					 * O leitor sempre procurou `candidate_interview` (nome da v1) e o
					 * `UnlockCard` do ATS v2 nasceu gravando `view_candidate`, que é
					 * como o motivo se chama em `CREDITS_HISTORY_REASON`. O crédito
					 * debitava e o desbloqueio nunca era encontrado: o cliente pagava e
					 * continuava vendo "Candidato bloqueado".
					 *
					 * Aceitar as duas honra os consumos JÁ gravados com o nome errado —
					 * consertar só o escritor deixaria perdido o crédito de quem já
					 * pagou, e isso vira estorno manual.
					 *
					 * Em memória porque o Firestore aceita UM `in` por consulta, e ele
					 * já está em `userId`. Somar um segundo quebraria a query inteira.
					 */
					const feature = d?.feature as string | undefined
					if (feature !== 'candidate_interview' && feature !== 'view_candidate') continue

					const userId = d?.userId as string | undefined
					const jobApplied = d?.jobApplied as string | undefined
					if (!userId || !jobApplied) continue

					const wantedJobs = wantedByUser.get(userId)
					if (wantedJobs?.has(jobApplied)) {
						result.add({ id: userId, jobApplied })
					}
				}
			}

			return result
		},
	}
}

