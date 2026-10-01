import type { InfraProvider } from '@coploy/infra'

import type { CandidatePublicView } from './candidate-public-view-types'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo lê a página `@` do candidato (a rede do
 * candidato, da Coploy hospedada) para mostrá-la na ficha do ATS quando ele
 * compartilhou o perfil. Nesta distribuição não existe página `@`: a ficha
 * mostra a trajetória, que já vinha do perfil do candidato.
 */
export async function resolveCandidatePublicView(
	_infra: InfraProvider,
	_userId: string,
): Promise<CandidatePublicView | null> {
	return null
}
