/**
 * O que o recrutador vê do perfil Coploy que o candidato compartilhou (F5).
 *
 * Tipo aberto de propósito: a ficha do candidato (código aberto) conhece a
 * FORMA, e quem preenche é a rede do candidato (`candidate-network-view.ts`),
 * que no espelho público vira um stub que devolve null. Só entra o que a
 * página `@` já mostra a qualquer visitante — consentido e aprovado pela
 * curadoria (decisão D1 do F5, 30/09).
 */
export interface CandidatePublicView {
	handle: string
	/** Endereço da página `@` no app do candidato deste ambiente. */
	url: string
	photoUrl: string | null
	videos: Array<{
		itemId: string
		questionLabel: string | null
		videoUrl: string | null
		answer: string | null
		feedback: string | null
		strengths: string[]
	}>
	links: string[]
	projects: Array<{
		title: string
		description: string | null
		link: string | null
		repo: string | null
		image: string | null
	}>
	summary: {
		skills: string[]
		recurringStrengths: string[]
		strongestDimension: 'structure' | 'examples' | 'depth' | null
		interviewsAnalyzed: number
	} | null
	stats: { interviews: number; videoSeconds: number | null }
}

/**
 * O candidato escolheu o perfil no lugar da entrevista? Duas portas levam a
 * isso: compartilhar pela vaga na área do candidato (origem `coploy_profile`)
 * ou escolher o perfil na sala de entrevista depois de convidado (marca
 * `coployProfileSharedAt`, origem continua a do convite).
 */
export function sharedCoployProfile(
	jobApplied: { source?: string | null; coployProfileSharedAt?: unknown } | null | undefined,
	interviewDoc?: { source?: unknown } | null,
): boolean {
	if (jobApplied?.coployProfileSharedAt) return true
	return (jobApplied?.source ?? (interviewDoc?.source as string | undefined)) === 'coploy_profile'
}
