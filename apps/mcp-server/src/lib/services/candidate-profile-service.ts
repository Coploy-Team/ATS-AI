import type { InfraProvider } from '@coploy/infra'

import * as coreClient from '@/lib/core-client'
import { withInterviewHandoff } from '@/lib/interview-link'
import { createCandidateAuthService } from './candidate-auth-service'

/**
 * Currículo vivo do candidato no canal MCP.
 *
 * A regra vive toda no core (`/dream-jobs/profile`), que é a porta única de
 * escrita compartilhada com a área do candidato e o app de entrevista. Aqui só
 * autenticamos como o candidato e traduzimos para o vocabulário das tools —
 * incluindo o `nextStep`, que é o que faz o assistente saber o que pedir a
 * seguir na conversa.
 */

export interface ProfileOverview {
	profile: coreClient.CandidateProfile | null
	/** Campos ausentes, já priorizados pelo core (o que mais pesa primeiro). */
	missingFields: string[]
	completeness: number
	interview: coreClient.ProfileInterviewStatus
	nextStep: 'complete_profile' | 'start_profile_interview' | 'finish_profile_interview' | 'done'
}

/** Só o que já foi preenchido — evita mandar dezenas de nulls pro modelo. */
function compact(value: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(value).filter(([, v]) => {
			if (v == null) return false
			if (Array.isArray(v)) return v.length > 0
			if (typeof v === 'string') return v.trim().length > 0
			return true
		}),
	)
}

export function createCandidateProfileService(infra: InfraProvider) {
	const candidateAuthService = createCandidateAuthService(infra)

	async function tokenFor(uid: string): Promise<string> {
		return candidateAuthService.mintUserIdToken(uid)
	}

	return {
		async getOverview(uid: string): Promise<ProfileOverview> {
			const token = await tokenFor(uid)
			const [profileResult, interviewResult] = await Promise.all([
				coreClient.getCandidateProfile(token),
				coreClient.getProfileInterviewStatus(token),
			])

			const raw = profileResult.ok ? profileResult.data : null
			const profile = raw ? (compact(raw) as unknown as coreClient.CandidateProfile) : null
			const missingFields = raw?.missingFields ?? []
			const completeness = raw?.completeness ?? 0

			const interview: coreClient.ProfileInterviewStatus = interviewResult.ok
				? interviewResult.data
				: {
						hasInterview: false,
						jobId: null,
						companyId: null,
						status: 'not_started',
						interviewUrl: null,
						createdAt: null,
						completedAt: null,
					}

			// Só o essencial trava a entrevista; o resto do currículo o candidato
			// enriquece depois, inclusive pelo chat.
			const essentialMissing = missingFields.filter((field) =>
				['occupation', 'level'].includes(field),
			)

			let nextStep: ProfileOverview['nextStep'] = 'done'
			if (interview.status === 'completed') nextStep = 'done'
			else if (interview.hasInterview) nextStep = 'finish_profile_interview'
			else if (essentialMissing.length > 0) nextStep = 'complete_profile'
			else nextStep = 'start_profile_interview'

			// Entrevista pendente: esta leitura é o ponto de entrega do link, então
			// ele precisa vir autenticado (senão a pessoa cai no login de novo).
			if (interview.hasInterview && interview.status !== 'completed' && interview.interviewUrl) {
				interview.interviewUrl = await withInterviewHandoff(interview.interviewUrl, token)
			}

			return { profile, missingFields, completeness, interview, nextStep }
		},

		/** Merge parcial no currículo — o core cria o perfil na primeira escrita. */
		async saveProfile(
			uid: string,
			fields: Record<string, unknown>,
		): Promise<{ ok: boolean; message: string; completeness?: number; missingFields?: string[] }> {
			const token = await tokenFor(uid)
			const result = await coreClient.updateCandidateProfile(token, fields)
			if (!result.ok) return { ok: false, message: result.message }
			return {
				ok: true,
				message: 'Profile updated.',
				completeness: result.data.completeness ?? undefined,
				missingFields: result.data.missingFields ?? undefined,
			}
		},

		/**
		 * Importa o currículo inteiro de uma vez.
		 *
		 * É o caminho principal: o candidato conta a trajetória numa resposta
		 * aberta, anexa o PDF (que o próprio ChatGPT lê) ou cola o texto do
		 * LinkedIn — e o modelo estrutura tudo numa chamada só. Formulário longo
		 * é onde as pessoas desistem; aqui o trabalho pesado sai da conversa.
		 *
		 * Listas são ACRESCENTADAS às existentes (com deduplicação simples), e
		 * campos de texto só preenchem o que está vazio — importar não pode
		 * apagar o que a pessoa escreveu à mão.
		 */
		async importProfile(
			uid: string,
			imported: Record<string, unknown>,
		): Promise<{ ok: boolean; message: string; completeness?: number; missingFields?: string[] }> {
			const token = await tokenFor(uid)
			const current = await coreClient.getCandidateProfile(token)
			const existing = current.ok ? current.data : ({} as coreClient.CandidateProfile)

			const patch: Record<string, unknown> = {}

			// Escalares: só preenchem lacunas (o que a pessoa digitou tem precedência)
			for (const field of [
				'occupation',
				'level',
				'headline',
				'summary',
				'location',
				'countryOfResidence',
				'professionalObjectives',
				'company',
				'linkedinUrl',
				'websiteUrl',
				'githubUrl',
				'yearsOfExperience',
				'bio',
				'availability',
			]) {
				const incoming = imported[field]
				const currentValue = (existing as unknown as Record<string, unknown>)[field]
				const currentIsEmpty =
					currentValue == null || (typeof currentValue === 'string' && currentValue.trim() === '')
				if (incoming != null && currentIsEmpty) patch[field] = incoming
			}

			// Skills: união sem duplicar (case-insensitive)
			if (Array.isArray(imported.skills)) {
				const seen = new Set((existing.skills ?? []).map((s) => s.toLowerCase()))
				const merged = [...(existing.skills ?? [])]
				for (const skill of imported.skills as string[]) {
					if (skill && !seen.has(skill.toLowerCase())) {
						seen.add(skill.toLowerCase())
						merged.push(skill)
					}
				}
				if (merged.length > 0) patch.skills = merged
			}

			// Listas de valores fechados: união, sem duplicar (modalidade, países)
			for (const field of ['workModalities', 'countriesOfInterest'] as const) {
				const incoming = imported[field]
				if (!Array.isArray(incoming) || incoming.length === 0) continue
				const existingValues = ((existing as unknown as Record<string, unknown>)[field] as string[] | null) ?? []
				const merged = [...new Set([...existingValues, ...(incoming as string[])])]
				if (merged.length > existingValues.length) patch[field] = merged
			}

			// Listas do currículo: acrescenta, deduplicando pelo par que identifica o item
			const listKeys = [
				{ key: 'experiences', identity: ['title', 'company'] },
				{ key: 'education', identity: ['institution', 'degree'] },
				{ key: 'languages', identity: ['language'] },
				{ key: 'certifications', identity: ['name', 'issuer'] },
				{ key: 'skillDetails', identity: ['name'] },
			] as const
			for (const { key, identity } of listKeys) {
				const incoming = imported[key]
				if (!Array.isArray(incoming) || incoming.length === 0) continue
				const existingItems = ((existing as unknown as Record<string, unknown>)[key] as
					| Array<Record<string, unknown>>
					| null) ?? []
				const fingerprint = (item: Record<string, unknown>) =>
					identity.map((f) => String(item[f] ?? '').trim().toLowerCase()).join('|')
				const seen = new Set(existingItems.map(fingerprint))
				const merged = [...existingItems]
				for (const item of incoming as Array<Record<string, unknown>>) {
					const key2 = fingerprint(item)
					if (key2 !== identity.map(() => '').join('|') && !seen.has(key2)) {
						seen.add(key2)
						merged.push(item)
					}
				}
				if (merged.length > existingItems.length) patch[key] = merged
			}

			if (Object.keys(patch).length === 0) {
				return { ok: true, message: 'Nothing new to import — the résumé already had this information.' }
			}

			const result = await coreClient.updateCandidateProfile(token, patch)
			if (!result.ok) return { ok: false, message: result.message }
			return {
				ok: true,
				message: `Imported ${Object.keys(patch).length} section(s).`,
				completeness: result.data.completeness ?? undefined,
				missingFields: result.data.missingFields ?? undefined,
			}
		},

		/**
		 * Acrescenta um item a uma lista do currículo (experiência, formação,
		 * idioma, certificação) preservando os que já existem — o modelo manda só
		 * o item novo, não a lista inteira.
		 */
		async appendToList(
			uid: string,
			list: 'experiences' | 'education' | 'languages' | 'certifications',
			item: Record<string, unknown>,
		): Promise<{ ok: boolean; message: string; total?: number }> {
			const token = await tokenFor(uid)
			const current = await coreClient.getCandidateProfile(token)
			const existing = (current.ok ? (current.data[list] as unknown[] | null) : null) ?? []

			const result = await coreClient.updateCandidateProfile(token, {
				[list]: [...existing, item],
			})
			if (!result.ok) return { ok: false, message: result.message }
			return { ok: true, message: 'Added.', total: existing.length + 1 }
		},

		async startProfileInterview(
			uid: string,
			params: { occupation: string; level: string; language?: string; objectives?: string },
		): Promise<{ ok: true; data: coreClient.ProfileInterviewProvisionResult } | { ok: false; message: string }> {
			const token = await tokenFor(uid)
			const result = await coreClient.provisionProfileInterview(token, params)
			if (!result.ok) return { ok: false, message: result.message }

			const interviewUrl = result.data.interviewUrl
				? await withInterviewHandoff(result.data.interviewUrl, token)
				: null
			return { ok: true, data: { ...result.data, interviewUrl } }
		},
	}
}

export type CandidateProfileService = ReturnType<typeof createCandidateProfileService>
