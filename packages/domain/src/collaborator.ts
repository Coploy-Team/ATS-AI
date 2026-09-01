import type { EntityRef } from './common'

export interface Collaborator {
	id: string
	company_id?: string | null
	user_company_id?: string | null
	name?: string | null
	email?: string | null
	accessLevel?: string | null
	status?: boolean | null
	creationDate?: Date | null
	/** Reference to the associated UsersCompany document. */
	userRef?: EntityRef | null
	/**
	 * Receber o aviso de entrevista finalizada.
	 *
	 * Ausente = recebe. É o comportamento de hoje, e um campo novo não pode
	 * calar quem já contava com o aviso.
	 *
	 * Existe porque não havia como recusar: a saída em uso era pôr a pessoa na
	 * lista negra do Postmark, o que cala TODOS os e-mails para aquele endereço
	 * — inclusive redefinição de senha e alerta de prazo. Silenciar um aviso
	 * não pode custar o acesso à conta.
	 */
	notifyOnInterviewFinish?: boolean | null
}
