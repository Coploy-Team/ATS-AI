import { z } from 'zod'

import { engineTokenUsageSchema } from './engine-analysis'

export const engineJobDescriptionResponseSchema = z.object({
	descricao: z.string(),
	responsabilidades: z.string(),
	requisitos: z.string(),
	model: z.string().optional(),
	provider: z.enum(['openai', 'minimax']).optional(),
	usage: engineTokenUsageSchema.optional(),
})

export type EngineJobDescriptionResponse = z.infer<
	typeof engineJobDescriptionResponseSchema
>
