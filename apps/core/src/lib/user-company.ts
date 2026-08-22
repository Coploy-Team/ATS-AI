/**
 * Extrai o ID da empresa do documento do usuário.
 * Compatível com Firestore (company: DocumentReference com .id) e
 * MongoDB (company: string ou { _id: ObjectId } ou { id: string }).
 */
export function getCompanyIdFromUser(user: {
  company?: string | { id?: string; _id?: unknown }
}): string | undefined {
  if (!user?.company) return undefined
  const c = user.company
  if (typeof c === 'string') return c
  if (c.id) return c.id
  const raw = (c as { _id?: unknown })._id
  if (raw != null) return typeof raw === 'string' ? raw : String(raw)
  return undefined
}
