import { z } from 'zod'

export const AccessLevel = z.enum(['owner', 'editor', 'shared'])

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
