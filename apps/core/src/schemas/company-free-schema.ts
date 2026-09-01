import { z } from 'zod'

export const createCompanyFreeBodySchema = z.object({
	// Dados do usuário
	user: z.object({
		fullName: z.string().min(1, 'Nome completo é obrigatório'),
		occupation: z.string().optional().nullable(),
		email: z.string().email('Email inválido'),
		phone: z.string().min(1, 'Telefone é obrigatório'),
		password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
	}),
	// Dados da empresa
	company: z.object({
		name: z.string().min(1, 'Nome da empresa é obrigatório'),
		logoUrl: z.string().nullish().optional(),
		employees: z.string().optional().nullable(),
		segment: z.string().optional().nullable(),
		location: z.string().optional().nullable(),
		website: z.string().optional().nullable(),
		objective: z.array(z.string()).optional().nullable(),
		typeInterview: z.array(z.string()).optional().nullable(),
		notificationsEmail: z.boolean().default(false),
		notificationReportWeek: z.boolean().default(false),
		headquartersCountries: z.array(z.string()).optional().nullable(),
		evaluateInternationalCandidates: z.boolean().optional(),
	}),
})

export const createCompanyFreeResponseSchema = z.object({
	company: z.object({
		id: z.string(),
		companLogo: z.string().nullable(),
		companySize: z.string(),
		segment: z.string().nullable(),
		companyCity: z.string(),
		companyWebsite: z.string(),
		subscriptionPlan: z.string(),
	}),
	user: z.object({
		id: z.string(),
		email: z.string(),
		display_name: z.string(),
		is_owner: z.boolean(),
	}),
})
