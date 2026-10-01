import { z } from 'zod'
import { SUPPORTED_LANGUAGES } from '@/http/constants/insights-constants'

// Aceita códigos curtos do i18n (en, pt, es, fr, it) além dos completos
const INSIGHTS_LANGUAGE_INPUT = [
	...SUPPORTED_LANGUAGES,
	'en',
	'es',
	'fr',
	'it',
] as const

export const insightsBodySchema = z.object({
	language: z
		.enum(INSIGHTS_LANGUAGE_INPUT)
		.default('pt-BR')
		.describe('Idioma do insight'),
	force: z
		.boolean()
		.optional()
		.describe(
			'Quando true, ignora o cache do dia e regera o insight contra os dados atuais.',
		),
})

export const insightsResponseSchema = z.object({
	insight: z.string(),
	generatedAt: z.string(),
	language: z.enum(SUPPORTED_LANGUAGES),
	sampleSize: z
		.object({
			interviews: z.number(),
			jobs: z.number(),
		})
		.optional()
		.describe('Tamanho da amostra usada para gerar o insight.'),
})
