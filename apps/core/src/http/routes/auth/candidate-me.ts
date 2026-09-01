import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import {
	certificationSchema,
	educationSchema,
	experienceSchema,
	languageSchema,
} from '@/schemas/candidate-profile-schema'
import { createAuthService } from '@/lib/services/auth-service'
import { createCandidateProfileService } from '@/lib/services/candidate-profile-service'
import { createPessoaService } from '@/lib/services/pessoa-identity-service'

/** Alinhado ao schema canônico do repositório: campos legados opcionais. */
export const candidateMeDreamJobsInterviewSchema = z
	.object({
		jobId: z.string().nullable().optional(),
		jobAppliedId: z.string().nullable().optional(),
		status: z.string().nullable().optional(),
		generalFeedback: z.string().nullable().optional(),
	})
	.passthrough()
	.nullable()

type UserDocument = {
	id: string
	display_name: string
	email: string
	phone_number: string
	photo_url: string
	occupation?: string
	level?: string
	language?: string
	countryOfResidence?: string
	countriesOfInterest?: string[]
	professionalObjectives?: string
	resumeUrl?: string
	dreamJobsInterview?: {
		jobId?: string
		jobAppliedId?: string
		status?: string
	}
}

export function candidateMe(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	const profileService = createCandidateProfileService(app.infra)
	const pessoaService = createPessoaService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().get(
		'/auth/me',
		{
			schema: {
				'x-surface': 'candidato',
				tags: ['auth-candidate'],
				summary: 'Get current candidate user data',
				security: [{ bearerAuth: [] }],
				response: {
					200: z
						.object({
							name: z.string(),
							email: z.string(),
							phoneNumber: z.string(),
							photoUrl: z.string(),
							occupation: z.string(),
							level: z.string(),
							language: z.string(),
							countryOfResidence: z.string(),
							countriesOfInterest: z.array(z.string()),
							professionalObjectives: z.string(),
							resumeUrl: z.string(),
							headline: z.string(),
							summary: z.string(),
							skills: z.array(z.string()),
							experiences: z.array(experienceSchema),
							education: z.array(educationSchema),
							languages: z.array(languageSchema),
							certifications: z.array(certificationSchema),
							linkedinUrl: z.string(),
							completeness: z.number(),
							missingFields: z.array(z.string()),
							/** CPF só dígitos, resolvido de `pessoas` (null se sem vínculo). Self-scoped. */
							cpf: z.string().nullable(),
							dreamJobsInterview: candidateMeDreamJobsInterviewSchema,
						})
						.passthrough(),
				},
			},
		},
		async (request) => {
			const authHeader = request.headers.authorization
			if (!authHeader?.startsWith('Bearer ')) {
				throw new BadRequestError('Missing authorization header')
			}

			const token = authHeader.substring(7)
			const decoded = await authService.verifyToken(token)
			const userId = decoded.uid

			const user = await authService.getUser(userId) as UserDocument | null
			if (!user) {
				throw new BadRequestError('USER_NOT_FOUND')
			}

			let generalFeedback: string | null = null
			if (user.dreamJobsInterview?.jobAppliedId) {
				const jobApplied = await authService.getJobApplied(userId, user.dreamJobsInterview.jobAppliedId) as {
					interview?: { generalFeedback?: string }
				} | null

				generalFeedback = jobApplied?.interview?.generalFeedback ?? null
			}

			// Currículo vivo é a fonte do perfil profissional; o doc do usuário
			// segue como fonte da identidade. O service já resolve o fallback pros
			// candidatos que só têm dado no doc antigo.
			const profile = await profileService.getProfile(userId)

			// CPF vive só em `pessoas` — lookup reverso; falha não derruba a rota.
			let cpf: string | null = null
			try {
				cpf = await pessoaService.getCpfByUserId(userId)
			} catch {
				cpf = null
			}

			return {
				name: user.display_name,
				email: user.email,
				phoneNumber: user.phone_number,
				photoUrl: user.photo_url,
				occupation: profile.occupation ?? '',
				level: profile.level ?? '',
				language: user.language ?? 'pt-BR',
				countryOfResidence: profile.countryOfResidence ?? '',
				countriesOfInterest: profile.countriesOfInterest ?? [],
				professionalObjectives: profile.professionalObjectives ?? '',
				resumeUrl: profile.resumeUrl ?? '',
				headline: profile.headline ?? '',
				summary: profile.summary ?? '',
				skills: profile.skills ?? [],
				// Currículo que outras fontes (chat do plugin, upload de CV) montaram:
				// sem isso a área do candidato não exibe o que ele construiu por lá.
				experiences: profile.experiences ?? [],
				education: profile.education ?? [],
				languages: profile.languages ?? [],
				certifications: profile.certifications ?? [],
				linkedinUrl: profile.linkedinUrl ?? '',
				completeness: profile.completeness ?? 0,
				missingFields: profileService.missingFields(profile),
				cpf,
				dreamJobsInterview: user.dreamJobsInterview
					? { ...user.dreamJobsInterview, generalFeedback }
					: null,
			}
		},
	)
}
