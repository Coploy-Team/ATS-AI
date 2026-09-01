const GRAY_ZONE_MIN = 0.6
const GRAY_ZONE_MAX = 0.8
const EXEMPLIFICATION_THRESHOLD = 6
const REVIEW_LABEL = 'Revisar manualmente'

export function deriveAuthenticityConfidence(
	cheat: Record<string, unknown> | null | undefined,
	info: Array<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
	if (!cheat) return cheat ?? null

	const resumo = cheat.resumo_executivo as Record<string, unknown> | undefined
	if (!resumo) return cheat

	const pontuacao = resumo.pontuacao_autenticidade
	if (typeof pontuacao !== 'number') return cheat
	if (pontuacao < GRAY_ZONE_MIN || pontuacao > GRAY_ZONE_MAX) return cheat

	if (!Array.isArray(info) || info.length === 0) return cheat

	const scores: number[] = []
	for (const item of info) {
		const detalhado = (item as Record<string, unknown>).score_detalhado as
			| Record<string, unknown>
			| undefined
		if (!detalhado) continue
		const qualidade = detalhado.qualidade_resposta as Record<string, unknown> | undefined
		if (!qualidade) continue
		const exemplificacao = qualidade.exemplificacao
		if (typeof exemplificacao === 'number') {
			scores.push(exemplificacao)
		}
	}

	if (scores.length === 0) return cheat

	const avg = scores.reduce((a, b) => a + b, 0) / scores.length
	if (avg >= EXEMPLIFICATION_THRESHOLD) return cheat

	return {
		...cheat,
		resumo_executivo: {
			...(resumo as Record<string, unknown>),
			nivel_confianca: REVIEW_LABEL,
		},
	}
}
