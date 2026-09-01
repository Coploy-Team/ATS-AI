/**
 * Avaliação do RECRUTADOR (V2-302).
 *
 * Hoje a única nota registrada é a da IA. O humano decide, mas a decisão dele
 * não fica em lugar nenhum — o que inverte a relação que o produto promete: a
 * IA deveria apoiar a decisão, não ser a única evidência dela.
 *
 * ⚠️ A nota humana NUNCA é fundida com a da IA. São leituras diferentes, com
 * fontes diferentes, e a média das duas esconderia justamente o caso que mais
 * importa: quando elas discordam.
 */

export interface ScorecardCriterion {
	/** Estável — vem de `structuredRequirements` da vaga quando existe. */
	id: string
	label: string
	/** 1–5. Escala curta de propósito: 0–10 vira ruído entre avaliadores. */
	rating: number | null
	note?: string | null
}

export interface Scorecard {
	id: string
	companyId: string
	jobId: string
	/** Id do candidato no board (mesma chave do dossiê). */
	candidateId: string
	/** Quem avaliou — a nota tem dono. */
	authorId: string
	authorName?: string | null
	criteria: ScorecardCriterion[]
	/**
	 * Recomendação do avaliador. Deliberadamente separada das notas: um
	 * avaliador pode dar notas medianas e ainda assim recomendar (ou o
	 * contrário), e essa discordância é informação.
	 */
	recommendation: ScorecardRecommendation
	comment?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
}

export const SCORECARD_RECOMMENDATIONS = [
	'strong_yes',
	'yes',
	'neutral',
	'no',
	'strong_no',
] as const
export type ScorecardRecommendation = (typeof SCORECARD_RECOMMENDATIONS)[number]

/** Média simples dos critérios pontuados; `null` quando ninguém pontuou. */
export function scorecardAverage(criteria: ScorecardCriterion[]): number | null {
	const rated = criteria.filter((c) => typeof c.rating === 'number' && c.rating > 0)
	if (rated.length === 0) return null
	const sum = rated.reduce((acc, c) => acc + (c.rating ?? 0), 0)
	return Number((sum / rated.length).toFixed(1))
}
