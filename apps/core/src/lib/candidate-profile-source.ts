import { CANDIDATE_PROFILE_SOURCES, type CandidateProfileSource } from '@coploy/domain'

/**
 * De qual canal veio a escrita do currículo.
 *
 * ⚠️ Antes era `'dashboard'` cravado, para QUALQUER chamador — então o campo
 * `fieldSources`, que existe justamente para dizer de onde cada dado veio,
 * respondia a mesma coisa sempre. Um currículo inteiro montado por conversa no
 * assistente ficava marcado como digitado no painel, e não havia como saber
 * quanto do perfil nasceu de qual canal.
 *
 * O cabeçalho é uma DECLARAÇÃO do cliente, não uma credencial: quem mente aqui
 * só suja a própria procedência, e é por isso que o valor passa por allowlist em
 * vez de entrar cru — texto livre faria o campo deixar de significar algo.
 *
 * Ausente = `dashboard`, que preserva o comportamento de todo cliente atual.
 */
export function candidateProfileSourceFrom(
	header: string | string[] | undefined,
): CandidateProfileSource {
	const declarado = Array.isArray(header) ? header[0] : header
	return CANDIDATE_PROFILE_SOURCES.includes(declarado as CandidateProfileSource)
		? (declarado as CandidateProfileSource)
		: 'dashboard'
}
