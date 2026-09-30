/**
 * Qual colaborador é esta pessoa.
 *
 * ## Por que isto é um módulo e não uma linha em cada lugar
 *
 * Existiam DUAS cópias desta lógica — no hook de RBAC e na rota de
 * capabilities — e as duas procuravam por `userId`/`uuid`, campos que o
 * documento não tem. O resultado foi o pior possível: o servidor deixava todo
 * mundo como `owner` e a tela também, então a autorização parecia funcionar
 * porque nada era barrado em lugar nenhum.
 *
 * Consertar uma cópia e esquecer a outra teria sido pior ainda: a API
 * bloquearia e a interface continuaria oferecendo o botão. Identidade tem que
 * ser resolvida num lugar só.
 */
export interface CollaboratorLike {
	userRef?: unknown
	user_company_id?: unknown
	userId?: unknown
	uuid?: unknown
	id?: unknown
	email?: unknown
	accessLevel?: unknown
}

/**
 * `userRef` chega em três formas conforme o adaptador e a rota: o uid puro
 * (`"2B53..."`), um caminho (`"users/2B53..."`) ou o objeto de referência do
 * Firestore. Tratar só uma delas é o que produziu o bug.
 */
function referenceId(ref: unknown): string | null {
	if (typeof ref === 'string') return ref.split('/').pop() ?? null
	if (ref && typeof ref === 'object') {
		const object = ref as { id?: string; path?: string }
		return object.id ?? object.path?.split('/').pop() ?? null
	}
	return null
}

export function isCollaboratorFor(
	item: CollaboratorLike,
	userId: string,
	email?: string | null,
): boolean {
	if (referenceId(item.userRef) === userId) return true
	if (item.user_company_id === userId) return true
	if (item.userId === userId || item.id === userId || item.uuid === userId) return true

	/*
	 * E-mail por último: colaborador convidado e ainda não aceito pode não ter
	 * referência nenhuma, e aí o papel configurado é a única informação que
	 * existe sobre ele.
	 */
	const normalized = email?.trim().toLowerCase()
	return Boolean(
		normalized && typeof item.email === 'string' && item.email.toLowerCase() === normalized,
	)
}

/** O colaborador desta pessoa numa lista, ou `null`. */
export function findCollaborator<T extends CollaboratorLike>(
	collaborators: T[],
	userId: string,
	email?: string | null,
): T | null {
	return collaborators.find((item) => isCollaboratorFor(item, userId, email)) ?? null
}
