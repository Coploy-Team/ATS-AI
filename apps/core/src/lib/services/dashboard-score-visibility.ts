import type { InfraProvider } from '@coploy/infra'
import type { Company } from '@coploy/domain'

import { createCompanyCreditsService } from '@/lib/services/company-credits'

/**
 * Quais entrevistas podem entrar numa estatística de NOTA.
 *
 * O bloqueio por crédito vale para o candidato individual — mas média e
 * distribuição são o mesmo dado por outro caminho. Com um candidato na base,
 * "Nota média 1,0" no painel É a nota que o dossiê acabou de esconder, e o
 * cliente não precisa gastar crédito nenhum para lê-la.
 *
 * Não é preciosismo: foi assim que o Henrique descreveu o defeito — "não
 * apareceu a nota e isso está correto, porém aparece a nota em outros
 * lugares". Um paywall que a agregação contorna não é um paywall.
 *
 * Contagens (quantas entrevistas, quantos aprovados, funil) continuam livres:
 * elas não revelam desempenho de ninguém. O que se compra é a AVALIAÇÃO.
 */
export function createDashboardScoreVisibility(infra: InfraProvider) {
	const { getPaidUserIdsForCandidates } = createCompanyCreditsService(infra)

	return {
		/**
		 * Devolve só as entrevistas cuja nota o cliente já pode ver.
		 *
		 * Enterprise vê tudo — o contrato é fechado por mês, sem bloqueio por
		 * candidato, e é a mesma regra que o dossiê aplica.
		 */
		async filterVisibleScores<
			T extends { user_ref?: unknown; job_applied_ref?: unknown },
		>(companyId: string, interviews: T[]): Promise<T[]> {
			if (interviews.length === 0) return []

			const company = (await Promise.resolve(infra.companyRepository.getCompany(companyId)).catch(
				() => null,
			)) as Company | null
			const plan =
				company?.subscriptionPlan ??
				(company?.subscriptionDetails as { plan?: string } | null | undefined)?.plan
			if (plan === 'enterprise') return interviews

			const refId = (ref: unknown): string | null => {
				if (typeof ref === 'string') return ref.split('/').pop() ?? null
				if (ref && typeof ref === 'object') {
					const objeto = ref as { id?: string; path?: string }
					return objeto.id ?? objeto.path?.split('/').pop() ?? null
				}
				return null
			}

			const pares = interviews.map((entrevista) => ({
				id: refId(entrevista.user_ref) ?? '',
				jobApplied: refId(entrevista.job_applied_ref) ?? '',
			}))

			let pagos: Set<{ id: string; jobApplied: string }>
			try {
				pagos = await getPaidUserIdsForCandidates(companyId, pares)
			} catch {
				/*
				 * Falha de leitura não pode virar vazamento. Sem saber quem foi
				 * pago, o conservador é não mostrar nota nenhuma — o painel fica
				 * vazio, que é recuperável; o inverso não é.
				 */
				return []
			}

			const liberados = new Set(
				[...pagos].map((item) => `${item.id}:${item.jobApplied}`),
			)

			return interviews.filter((entrevista, indice) =>
				liberados.has(`${pares[indice].id}:${pares[indice].jobApplied}`),
			)
		},
	}
}
