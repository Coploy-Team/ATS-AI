import { z } from 'zod'

/**
 * Papéis aceitos na ESCRITA — precisa acompanhar `TENANT_ROLES` do domain.
 *
 * Ficou para trás quando `admin` e `recruiter` entraram: a tela de Time
 * passou a oferecer os dois e a API respondia 400 ("Expected 'owner' |
 * 'editor' | 'shared'"). Ampliar a matriz de papéis sem ampliar o enum que
 * valida a gravação é oferecer uma escolha que o servidor recusa.
 *
 * `editor` continua aceito: é legado e existe gravado na base — recusá-lo aqui
 * quebraria qualquer atualização de quem ainda o tem.
 */
export const AccessLevel = z.enum(['owner', 'admin', 'recruiter', 'editor', 'shared'])

export const createCollaboratorSchema = z.object({
	name: z.string(),
	email: z.string().email(),
	password: z.string().min(6),
	accessLevel: AccessLevel,
	status: z.boolean().default(true),
})

export const CollaboratorSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
	accessLevel: AccessLevel,
	status: z.boolean(),
	creationDate: z.union([
		z.custom<{ toDate: () => Date }>((data) => data != null && typeof (data as any).toDate === 'function'),
		z.date(),
	]),
	// null é estado legítimo: colaborador convidado sem conta vinculada ainda
	// (e registro anterior à ponte user_company_id do selfhosted). A união sem
	// null derrubava a lista inteira do Time com um único registro assim.
	userRef: z.union([
		z.custom<{ id?: string; path?: string }>((data) => data != null && typeof data === 'object' && !Array.isArray(data)),
		z.string(),
		z.null(),
	]),
})

export const updateCollaboratorSchema = CollaboratorSchema.omit({
	id: true,
	creationDate: true,
	userRef: true,
	email: true,
}).partial()

export type Collaborator = z.infer<typeof CollaboratorSchema>
export type CreateCollaborator = z.infer<typeof createCollaboratorSchema>
export type UpdateCollaborator = z.infer<typeof updateCollaboratorSchema>
