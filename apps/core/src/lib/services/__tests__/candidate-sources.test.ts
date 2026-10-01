import { CANDIDATE_SOURCES } from '@coploy/domain'

/**
 * O "compartilhar meu perfil com a empresa" da área do candidato (COP-11)
 * manda `source: 'coploy_profile'` para o apply do portal, que valida contra
 * este enum. Ele ficou fora da lista e o botão respondia 400 em homolog sem
 * nenhum teste perceber — os testes do candidato simulavam a chamada.
 */
describe('origens de candidatura', () => {
	it('aceita a origem que a área do candidato usa ao compartilhar o perfil', () => {
		expect(CANDIDATE_SOURCES).toContain('coploy_profile')
	})
})
