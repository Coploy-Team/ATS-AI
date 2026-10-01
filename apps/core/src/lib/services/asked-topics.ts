import type { InfraProvider } from '@coploy/infra'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo lista os assuntos que empresas
 * procuraram na busca nas transcrições e o candidato ainda não gravou. Nesta
 * distribuição a busca não existe, então não há assunto para avisar.
 */

export interface AskedTopic {
	topic: string
	companies: number
	lastAskedAt: string
}

export async function listAskedTopics(_infra: InfraProvider, _userId: string): Promise<AskedTopic[]> {
	return []
}
