/**
 * Id de uma referência do Firestore.
 *
 * O core devolve `job_ref`/`user_ref` ora como caminho (`companies/x/postJob/y`),
 * ora como objeto com `id`, dependendo do adaptador. Ler `.id` direto funciona
 * numa forma e devolve `undefined` na outra — silenciosamente, que é o pior
 * jeito de errar: o link simplesmente não leva a lugar nenhum.
 */
export function refId(value: unknown): string | null {
	if (typeof value === 'string') return value.split('/').pop() ?? null
	if (value && typeof value === 'object') {
		const ref = value as { id?: string; path?: string }
		return ref.id ?? ref.path?.split('/').pop() ?? null
	}
	return null
}
