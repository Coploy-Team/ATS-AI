import type { InfraProvider } from '@coploy/infra'

import type { TranscriptSearchInput, TranscriptSearchResult } from './transcript-search-types'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo busca nas respostas que o candidato
 * publicou na página `@` dele (a rede do candidato, da Coploy hospedada).
 * Nesta distribuição não existe página `@`, então a busca responde que não
 * está disponível e o ATS não mostra o campo.
 */
export function createTranscriptSearchService(_infra: InfraProvider) {
	return {
		async search(_input: TranscriptSearchInput): Promise<TranscriptSearchResult> {
			return { status: 'not_available', hit: null, hits: [], answer: null, remainingToday: null }
		},
	}
}
