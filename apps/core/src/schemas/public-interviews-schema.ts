import { z } from 'zod'
import {
	CountryMapping,
	careerLevelEnum,
} from '@/http/constants/interview-filters'
import { interviewTagsSchema } from '@/schemas/interview-tags-schema'

export const publicInterviewsQuerySchema = z.object({
	// Cursor-based pagination — `cursor` é a `date` (ISO string) do último item
	// da página anterior. Vazio na primeira página. Escala mesmo com base grande
	// porque NÃO faz full scan a cada chamada (limite 1000 anterior foi removido).
	cursor: z.string().optional().describe('ISO date cursor — pass last item date to fetch next page'),
	limit: z.string().default('12').transform(Number),
	find: z
		.string()
		.optional()
		.describe(
			'Universal search in candidate data and interview analysis (name, email, skills, technologies, descriptions, etc.)',
		),
	careerLevel: careerLevelEnum.default('all').describe('Career level filter'),
	country: z
		.string()
		.default('all')
		.describe('Country filter (accepts both English and Portuguese names)')
		.transform((val) => {
			if (val === 'all') {
				return val
			}
			const normalizedVal = val.toLowerCase()
			return (
				CountryMapping[normalizedVal as keyof typeof CountryMapping] ||
				normalizedVal
			)
		}),
	state: z.string().default('all').describe('State filter (e.g., PR, SP, RJ)'),
	city: z.string().default('all').describe('City filter'),
	startDate: z.string().optional().describe('Start date filter (ISO format)'),
	endDate: z.string().optional().describe('End date filter (ISO format)'),
	// Filtros de Hard Skills
	hardSkillTag: z
		.string()
		.optional()
		.describe('Filter by specific hard skill (e.g., "React", "Python")'),
	hardSkillArea: z
		.string()
		.optional()
		.describe('Filter by skill area (backend, frontend, mobile, etc.)'),
	minHardSkillPontuacao: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : undefined))
		.describe('Minimum hard skill score (1-5)'),
	hardSkillNivelEvidencia: z
		.string()
		.optional()
		.describe('Filter by evidence level (forte, moderada, fraca)'),
	// Filtros de Senioridade
	senioridadeNivel: z
		.string()
		.optional()
		.describe(
			'Filter by seniority level (junior, pleno, senior, especialista)',
		),
	minConfiancaSenioridade: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : undefined))
		.describe('Minimum seniority confidence (0-10)'),
	// Filtros de Market Fit
	tipoEmpresaIdeal: z
		.string()
		.optional()
		.describe(
			'Filter by ideal company type (startup, enterprise, consultoria)',
		),
	porteEmpresa: z
		.string()
		.optional()
		.describe('Filter by company size (pequeno, medio, grande)'),
	// Filtros de Score
	minScoreGeral: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : undefined))
		.describe('Minimum overall score (0-100)'),
	/**
	 * Anos de experiência do currículo do candidato.
	 *
	 * "profissional com mais de 15 anos" era um pedido que a busca não sabia
	 * responder: só existia senioridade aferida na entrevista, que é outra coisa
	 * e está preenchida em menos gente.
	 */
	minYearsExperience: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : undefined))
		.describe('Minimum years of experience declared in the candidate profile'),
	// Filtro: mostrar apenas candidatos que esta empresa já desbloqueou (gastou crédito)
	unlockedOnly: z
		.string()
		.optional()
		.transform((val) => val === 'true')
		.describe('When true, returns only candidates already unlocked by the calling company'),
})

export const publicInterviewsResponseSchema = z.object({
	nextCursor: z
		.string()
		.nullable()
		.describe('ISO date of last item — pass to next request as cursor. null = end of list.'),
	hasMore: z.boolean().describe('True if more pages exist after this one.'),
	interviews: z.array(
		z.object({
			id: z.string(),
			career_level: z.string().nullable(),
			city: z.string().nullable(),
			date: z.date(),
			email: z.string(),
			external_id: z.string().nullable().optional(),
			job_applied_ref: z.string().nullable().optional(),
			job_name: z.string(),
			job_ref: z.string().nullable(),
			name: z.string(),
			occupation: z.string().nullable(),
			phone_number: z.string().nullable(),
			photo_url: z.string(),
			professional_experience: z.string().nullable(),
			score: z.string().nullable().describe('Score médio agregado por email. null = oculto pela Opção A (viewer entrevistou esse candidato fora das exceções crédito/1ª).'),
			state: z.string().nullable(),
			type_interview: z.string(),
			user_ref: z.string().nullable(),
			academic: z.string().nullable().optional(),
			totalInterviewsByEmail: z
				.number()
				.describe('Total number of interviews conducted by this email'),
			interview_tags: z
				.array(interviewTagsSchema)
				.describe(
					'List of all interview tags from all interviews conducted by this email',
				),
			/*
			 * Declarado, não confiado ao spread: a resposta desta rota é montada por
			 * schema, e campo calculado que não aparece aqui é enriquecido no
			 * servidor e sumindo antes de chegar à tela — sem erro nenhum.
			 */
			yearsOfExperience: z
				.number()
				.nullable()
				.optional()
				.describe('Years of experience declared in the candidate profile'),
			countryOfResidence: z
				.string()
				.nullable()
				.optional()
				.describe('Country of residence code (ISO alpha-2, e.g., "BR", "US")'),
			countriesOfInterest: z
				.array(z.string())
				.nullable()
				.optional()
				.describe('Countries of interest codes (ISO alpha-2 array)'),
			isUnlocked: z
				.boolean()
				.describe('True se a empresa logada já desbloqueou este candidato (consumiu crédito).'),
		}),
	),
})
