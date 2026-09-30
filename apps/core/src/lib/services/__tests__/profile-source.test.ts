import { CANDIDATE_PROFILE_SOURCES } from '@coploy/domain'

import { candidateProfileSourceFrom as sourceOf } from '@/lib/candidate-profile-source'

/**
 * A procedência é DECLARADA pelo cliente, não deduzida.
 *
 * O defeito: a rota cravava `'dashboard'` para qualquer chamador, então o
 * `fieldSources` — que existe justamente para dizer de onde cada dado veio —
 * respondia sempre a mesma coisa. Um currículo inteiro montado por conversa no
 * assistente ficava marcado como digitado no painel.
 */
describe('de qual canal veio a escrita do currículo', () => {
	it('aceita os canais que o domínio conhece', () => {
		for (const canal of CANDIDATE_PROFILE_SOURCES) {
			expect(sourceOf(canal)).toBe(canal)
		}
	})

	/* Ausente = como era antes. Nenhum cliente existente muda de comportamento. */
	it('sem cabeçalho, continua sendo o painel', () => {
		expect(sourceOf(undefined)).toBe('dashboard')
	})

	/*
	 * O cabeçalho é declaração, não credencial — quem mente só suja a própria
	 * procedência. Mas valor fora do vocabulário não entra: gravar texto livre
	 * ali faria o campo deixar de significar algo.
	 */
	it('recusa canal inventado e cai no padrão', () => {
		expect(sourceOf('roubado')).toBe('dashboard')
		expect(sourceOf('')).toBe('dashboard')
	})

	it('cabeçalho repetido usa o primeiro, não quebra', () => {
		expect(sourceOf(['chat', 'dashboard'])).toBe('chat')
	})
})
