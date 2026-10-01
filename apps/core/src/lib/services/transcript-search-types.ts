import type { InfraProvider } from '@coploy/infra'

/**
 * Busca nas transcrições — o contrato aberto (D1–D8 de 30/09).
 *
 * A rota vive no core aberto para o ATS compilar igual nas duas edições; a
 * implementação é da Coploy hospedada (lê a página `@` e usa modelo de IA) e,
 * no espelho público, vira um stub que responde `not_available`.
 */

export type TranscriptSearchStatus =
	/** O trecho que responde, nas palavras da pessoa (e a resposta escrita, quando permitida). */
	| 'found'
	/** A pessoa não falou disso no que dá para buscar. */
	| 'not_found'
	/** A pergunta pede avaliação da pessoa ("ela é boa?"): a Coploy não avalia (D7). */
	| 'evaluative'
	/** Nada para buscar: sem resposta publicada nem entrevista com a empresa. */
	| 'no_published_answers'
	/** Instalação sem a busca. */
	| 'not_available'

export interface TranscriptSearchHit {
	itemId: string
	/** `profile`: publicada na página `@`; `interview`: entrevista feita para esta empresa. */
	source: 'profile' | 'interview'
	/** Na página `@`, o rótulo genérico (sem empresa); na entrevista da empresa, a pergunta dela. */
	questionLabel: string | null
	videoUrl: string | null
	text: string
	/** Segundos no vídeo; null quando a resposta não tem legenda com tempo. */
	start: number | null
	end: number | null
}

export interface TranscriptSearchResult {
	status: TranscriptSearchStatus
	/** O trecho principal (o primeiro citado). */
	hit: TranscriptSearchHit | null
	/** Todos os trechos citados (até 3). */
	hits: TranscriptSearchHit[]
	/** Resposta curta escrita pela IA a partir dos trechos citados (D5/D6); null sem permissão ou sem citação válida. */
	answer: string | null
	/** Quantas perguntas a empresa ainda pode fazer hoje. */
	remainingToday: number | null
}

export interface TranscriptSearchInput {
	companyId: string
	userId: string
	query: string
	/** A pessoa compartilhou o perfil Coploy com esta vaga (libera a página `@`, D1). */
	includeProfile: boolean
	/** Vagas que esta sessão alcança; null = todas (recrutador só vê as dele). */
	jobIdsInScope: Set<string> | null
}

export type TranscriptSearchFactory = (infra: InfraProvider) => {
	search(input: TranscriptSearchInput): Promise<TranscriptSearchResult>
}
