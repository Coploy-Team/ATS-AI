import { z } from 'zod'

export const UsersCompanySchema = z.object({
	company: z.string(),
	created_time: z.union([z.string().datetime(), z.number()]), // Timestamp ou string ISO
	display_name: z.string(),
	email: z.string().email(),
	first_name: z.string(),
	is_owner: z.boolean(),
	last_name: z.string(),
	occupation: z.string(),
	phone_number: z.string().optional(), // Pode ser vazio
	photo_url: z.string().url().optional(),
})

export type UsersCompany = z.infer<typeof UsersCompanySchema>
