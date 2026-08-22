import { findCollaborator, isCollaboratorFor } from '../collaborator-identity'

/**
 * Identidade de colaborador, com as formas do dado REAL.
 *
 * Este módulo nasceu de um bug que deixou o RBAC inerte: duas cópias da mesma
 * lógica procuravam `userId`/`uuid`, e o documento guarda `userRef`. Todo mundo
 * virava `owner` e nada era barrado — em homolog, com a chave ligada.
 *
 * O formato abaixo veio do dado de produção-espelho, não de suposição: em
 * homolog `userRef` é o uid puro, e foi assim que o bug foi confirmado.
 */
const UID = '2B53bPWfh4Zq52UFeiuxswJwtkF3'

describe('identidade do colaborador', () => {
	it('casa com userRef como uid puro (formato de homolog)', () => {
		expect(isCollaboratorFor({ userRef: UID }, UID)).toBe(true)
	})

	it('casa com userRef como caminho', () => {
		expect(isCollaboratorFor({ userRef: `users/${UID}` }, UID)).toBe(true)
	})

	it('casa com userRef como referência do Firestore', () => {
		expect(isCollaboratorFor({ userRef: { id: UID } }, UID)).toBe(true)
	})

	it('casa por e-mail quando não há referência — convite ainda não aceito', () => {
		expect(isCollaboratorFor({ email: 'Alguem@Teste.com' }, UID, 'alguem@teste.com')).toBe(true)
	})

	it('não casa com outra pessoa', () => {
		expect(isCollaboratorFor({ userRef: 'outro-uid', email: 'x@x.com' }, UID, 'eu@eu.com')).toBe(
			false,
		)
	})

	/*
	 * O comportamento que fazia o bug passar despercebido: sem casar, o papel
	 * vinha `undefined` e virava `owner`. Aqui garantimos que a ausência é
	 * ausência mesmo — quem decide o fallback é `normalizeTenantRole`.
	 */
	it('devolve null quando ninguém casa, em vez de um palpite', () => {
		expect(findCollaborator([{ userRef: 'outro' }], UID)).toBeNull()
	})

	it('acha o papel certo numa lista real', () => {
		const rows = [
			{ userRef: 'rOecWgjGTege6AovMQIRIkdXuSc2', accessLevel: 'editor' },
			{ userRef: UID, accessLevel: 'owner' },
		]
		expect(findCollaborator(rows, UID)?.accessLevel).toBe('owner')
		expect(findCollaborator(rows, 'rOecWgjGTege6AovMQIRIkdXuSc2')?.accessLevel).toBe('editor')
	})
})
