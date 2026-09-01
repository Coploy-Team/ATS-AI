import { TENANT_ROLES } from '@coploy/domain'

import { AccessLevel } from '../collaborator-schema'

/**
 * O enum de escrita tem que acompanhar os papéis do domínio.
 *
 * Quando `admin` e `recruiter` entraram na matriz, este enum ficou para trás:
 * a tela de Time passou a oferecer os dois e a API respondia 400 —
 * "Expected 'owner' | 'editor' | 'shared'". Oferecer uma escolha que o
 * servidor recusa é pior do que não oferecer, e nada quebrava no build porque
 * as duas listas vivem em arquivos diferentes.
 */
describe('papéis aceitos na escrita', () => {
	it('aceita todos os papéis que o domínio conhece', () => {
		for (const papel of TENANT_ROLES) {
			expect(AccessLevel.safeParse(papel).success).toBe(true)
		}
	})

	it('não aceita papel inventado', () => {
		expect(AccessLevel.safeParse('gerente').success).toBe(false)
	})
})
