import type { InfraProvider } from '@coploy/infra'

type Pair = { id: string | null; jobApplied: string | null }

/**
 * Nesta distribuição não existe cobrança por desbloqueio: toda entrevista
 * finalizada é visível para quem tem permissão de ver o candidato. O serviço
 * continua existindo porque o mascaramento é decidido em cinco lugares — e
 * cada um deles perguntar "tem billing?" seria a mesma regra escrita cinco
 * vezes, pronta para divergir.
 */
export function createCompanyCreditsService(_infra: InfraProvider) {
	return {
		async getPaidUserIdsForCandidates(
			_companyId: string,
			pairs: Pair[],
		): Promise<Set<{ id: string; jobApplied: string }>> {
			return new Set(
				pairs.filter(
					(p): p is { id: string; jobApplied: string } => !!p.id && !!p.jobApplied,
				),
			)
		},
	}
}
