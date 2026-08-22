import { z } from 'zod'

/**
 * Schema comum para paginação usado em múltiplas rotas
 */
export const paginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	totalPages: z.number(),
	hasMore: z.boolean(),
})

/**
 * Schema comum para paginação com descrição personalizada
 */
export const createPaginationSchema = (totalDescription?: string) =>
	z.object({
		total: z.number().describe(totalDescription || 'Total number of items'),
		page: z.number(),
		totalPages: z.number(),
		hasMore: z.boolean(),
	})
