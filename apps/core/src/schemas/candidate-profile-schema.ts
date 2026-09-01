import { assertValidCpf } from '@coploy/domain'
import { z } from 'zod'

/**
 * Currículo vivo do candidato.
 *
 * Todas as fontes (chat do plugin, área do candidato, upload de CV, LinkedIn)
 * falam este contrato. Campos são opcionais de propósito: o perfil se completa
 * aos poucos, e cada fonte preenche a parte que conhece.
 */

/**
 * CPF opcional validado com a mesma regra de `assertValidCpf` (TOS-013).
 * Rejeita no schema ANTES de persistir — evita gravar CPF inválido em
 * candidate_profiles quando o upsert pessoa falha e o catch engole o erro.
 */
export const cpfInputSchema = z
	.string()
	.min(11)
	.max(18)
	.refine(
		(value) => {
			try {
				assertValidCpf(value)
				return true
			} catch {
				return false
			}
		},
		{ message: 'CPF inválido' },
	)

export const experienceSchema = z.object({
	id: z.string().nullish(),
	title: z.string().nullish(),
	company: z.string().nullish(),
	location: z.string().nullish(),
	/** AAAA-MM */
	startDate: z.string().nullish(),
	/** Ausente/null quando é o emprego atual. */
	endDate: z.string().nullable().nullish(),
	current: z.boolean().nullish(),
	description: z.string().nullish(),
	skills: z.array(z.string()).nullish(),
})

export const educationSchema = z.object({
	id: z.string().nullish(),
	institution: z.string().nullish(),
	degree: z.string().nullish(),
	fieldOfStudy: z.string().nullish(),
	startDate: z.string().nullish(),
	endDate: z.string().nullable().nullish(),
	current: z.boolean().nullish(),
	description: z.string().nullish(),
})

export const languageProficiencyEnum = z.enum([
	'basic',
	'intermediate',
	'advanced',
	'fluent',
	'native',
])

export const languageSchema = z.object({
	language: z.string().nullish(),
	proficiency: languageProficiencyEnum.nullish(),
})

export const certificationSchema = z.object({
	id: z.string().nullish(),
	name: z.string().nullish(),
	issuer: z.string().nullish(),
	issueDate: z.string().nullish(),
	expirationDate: z.string().nullable().nullish(),
	credentialUrl: z.string().nullish(),
})

/** Campos que qualquer fonte pode escrever. */
export const candidateProfileWritableSchema = z.object({
	name: z.string().min(2).optional(),
	phone: z.string().optional(),
	/**
	 * CPF opcional (TOS-013). Aceito na entrada pra alimentar a camada `pessoa`;
	 * NÃO faz parte do schema de resposta — nunca deve sair na API.
	 * Validado com assertValidCpf antes de persistir.
	 */
	cpf: cpfInputSchema.optional(),
	headline: z.string().max(200).optional(),
	summary: z.string().max(4000).optional(),
	occupation: z.string().optional(),
	level: z.string().optional(),
	yearsOfExperience: z.number().int().min(0).max(70).optional(),
	professionalObjectives: z.string().max(4000).optional(),
	company: z.string().optional(),
	location: z.string().optional(),
	countryOfResidence: z.string().optional(),
	countriesOfInterest: z.array(z.string()).optional(),
	skills: z.array(z.string()).max(100).optional(),
	experiences: z.array(experienceSchema).max(50).optional(),
	education: z.array(educationSchema).max(30).optional(),
	languages: z.array(languageSchema).max(20).optional(),
	certifications: z.array(certificationSchema).max(50).optional(),
	resumeUrl: z.string().optional(),
	linkedinUrl: z.string().optional(),
	/** @deprecated alias legado de `occupation` — aceito na entrada, normalizado no service. */
	profession: z.string().optional(),
})

/**
 * Resposta: currículo + identidade + metadados de completude.
 *
 * Campos são `nullish` (não só `optional`) porque o domínio distingue "nunca
 * preenchido" de "existe e está vazio" — e o Firestore devolve null de fato.
 */
export const candidateProfileSchema = z.object({
	id: z.string(),
	name: z.string().nullish(),
	email: z.string().nullish(),
	phone: z.string().nullish(),
	photoUrl: z.string().nullish(),
	headline: z.string().nullish(),
	summary: z.string().nullish(),
	occupation: z.string().nullish(),
	level: z.string().nullish(),
	yearsOfExperience: z.number().nullish(),
	professionalObjectives: z.string().nullish(),
	company: z.string().nullish(),
	location: z.string().nullish(),
	countryOfResidence: z.string().nullish(),
	countriesOfInterest: z.array(z.string()).nullish(),
	skills: z.array(z.string()).nullish(),
	experiences: z.array(experienceSchema).nullish(),
	education: z.array(educationSchema).nullish(),
	languages: z.array(languageSchema).nullish(),
	certifications: z.array(certificationSchema).nullish(),
	resumeUrl: z.string().nullish(),
	linkedinUrl: z.string().nullish(),
	completeness: z.number().nullish(),
	fieldSources: z.record(z.string()).nullish(),
	missingFields: z.array(z.string()).optional(),
	createdAt: z.union([z.string(), z.date()]).nullish(),
	updatedAt: z.union([z.string(), z.date()]).nullish(),
	/** @deprecated presente só em docs legados. */
	profession: z.string().nullish(),
})

export const createCandidateProfileSchema = candidateProfileWritableSchema.extend({
	name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
	email: z.string().email('Email inválido').optional(),
})

export const updateCandidateProfileSchema = candidateProfileWritableSchema

export type CandidateProfileWritable = z.infer<typeof candidateProfileWritableSchema>
