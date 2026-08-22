/**
 * Nota de entrevista, sempre em 0–10.
 *
 * O dado real chega em três formatos: número, string com vírgula ("8,8") e
 * escala 0–100 em registros legados. Sem normalizar, a lista de candidatos
 * mostrava "25,0" e "15,0" numa coluna que promete /10 — o recrutador não tem
 * como saber que ali era 2,5.
 *
 * A regra `> 10 → /10` é a mesma que o core aplica em `interviews-service`;
 * duplicá-la aqui é deliberado (o ATS não importa código do backend), mas ela
 * mora num lugar só do lado do cliente.
 */
export function normalizeScore(value: unknown): number | null {
	if (value === null || value === undefined) return null

	const parsed =
		typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'))

	/*
	 * ZERO É NOTA.
	 *
	 * A regra era `<= 0 → null`, e `null` a tela desenha como "—": quem tirou 0
	 * aparecia como "ainda não avaliado", que é a leitura oposta. O Farofa pegou
	 * isso na base de candidatos. Negativo continua fora — é dado corrompido, não
	 * desempenho.
	 */
	if (!Number.isFinite(parsed) || parsed < 0) return null

	const scaled = parsed > 10 ? parsed / 10 : parsed
	// ainda fora da escala depois de dividir = dado corrompido, não invente
	if (scaled > 10) return null

	return Number(scaled.toFixed(1))
}

/**
 * A nota da PESSOA quando ela tem várias entrevistas: a média.
 *
 * Era a maior — o que fazia a base parecer melhor do que é e divergia do
 * hunting, que já mostra média. Duas telas dando números diferentes para a
 * mesma pessoa é como o recrutador perde a confiança no número.
 *
 * Entrevista sem nota fica fora do cálculo: ela não é um zero, é uma ausência.
 * Se nenhuma tem nota, não há média.
 */
export function averageScore(values: Array<number | null | undefined>): number | null {
	const scored = values.filter((value): value is number => typeof value === 'number')
	if (scored.length === 0) return null
	return Number((scored.reduce((total, value) => total + value, 0) / scored.length).toFixed(1))
}
