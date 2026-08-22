import type { Scorecard, ScorecardCriterion, ScorecardRecommendation } from '@coploy/domain'
import { scorecardAverage } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

export interface UpsertScorecardInput {
	companyId: string
	jobId: string
	candidateId: string
	authorId: string
	authorName?: string | null
	criteria: ScorecardCriterion[]
	recommendation: ScorecardRecommendation
	comment?: string | null
}

/**
 * Avaliação do recrutador (V2-302).
 *
 * O que muda de verdade: a decisão humana passa a ter registro. Antes o único
 * veredito gravado era o da IA, e o recrutador ficava sem lugar para dizer o que
 * achou — o que inverte a promessa do produto, onde a IA apoia a decisão.
 *
 * ⚠️ A nota humana não se mistura com a da IA em NENHUM ponto. O agregado devolve
 * as duas lado a lado, porque a discordância entre elas é o dado mais valioso da
 * tela: é ali que o recrutador confere se o motor está calibrado.
 */
export function createScorecardService(infra: InfraProvider) {
	return {
		/**
		 * Um autor tem UMA avaliação por candidato numa vaga.
		 *
		 * Reavaliar é editar, não empilhar: histórico de "achei 3, agora acho 4"
		 * viraria ruído na média e ninguém consegue ler dez versões da mesma
		 * opinião.
		 */
		async upsertScorecard(input: UpsertScorecardInput): Promise<Scorecard> {
			const { companyId, jobId, candidateId, authorId } = input

			if (input.criteria.length === 0 && !input.comment?.trim()) {
				throw new BadRequestError('Avalie ao menos um critério ou escreva um comentário')
			}
			for (const criterion of input.criteria) {
				if (criterion.rating !== null && (criterion.rating < 1 || criterion.rating > 5)) {
					throw new BadRequestError('Nota de critério deve estar entre 1 e 5')
				}
			}

			const existing = await infra.scorecardRepository.getScorecardByAuthor(
				companyId,
				jobId,
				candidateId,
				authorId,
			)

			if (existing) {
				await infra.scorecardRepository.updateScorecard(companyId, existing.id, {
					criteria: input.criteria,
					recommendation: input.recommendation,
					comment: input.comment ?? null,
				} as never)
				return {
					...existing,
					criteria: input.criteria,
					recommendation: input.recommendation,
					comment: input.comment ?? null,
					updatedAt: new Date(),
				}
			}

			return infra.scorecardRepository.createScorecard(companyId, {
				companyId,
				jobId,
				candidateId,
				authorId,
				authorName: input.authorName ?? null,
				criteria: input.criteria,
				recommendation: input.recommendation,
				comment: input.comment ?? null,
			} as never)
		},

		/**
		 * Avaliações de um candidato + agregado.
		 *
		 * `consensus` só existe com 2+ avaliadores: com um só, "consenso" seria a
		 * opinião de uma pessoa vestida de estatística.
		 */
		async listScorecards(params: { companyId: string; jobId: string; candidateId: string }) {
			const items = await infra.scorecardRepository.listScorecards(
				params.companyId,
				params.jobId,
				params.candidateId,
			)

			const averages = items
				.map((item) => scorecardAverage(item.criteria))
				.filter((value): value is number => value !== null)

			const average =
				averages.length > 0
					? Number((averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(1))
					: null

			const positives = items.filter((i) =>
				['strong_yes', 'yes'].includes(i.recommendation),
			).length

			return {
				scorecards: items,
				summary: {
					count: items.length,
					average,
					/** `null` com menos de 2 avaliadores — ver comentário acima. */
					consensus:
						items.length >= 2
							? positives >= Math.ceil(items.length / 2)
								? ('positive' as const)
								: ('negative' as const)
							: null,
				},
			}
		},

		async deleteScorecard(params: { companyId: string; scorecardId: string }) {
			await infra.scorecardRepository.deleteScorecard(params.companyId, params.scorecardId)
		},
	}
}
