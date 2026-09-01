import type {
	CandidateProfile,
	CandidateProfileSource,
	User,
} from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { createTaxonomyService } from './taxonomy-service'

import { createPessoaService } from './pessoa-identity-service'

/**
 * Currículo vivo do candidato — porta ÚNICA de escrita do perfil.
 *
 * Todas as fontes passam por aqui: conversa no plugin (ChatGPT/Claude), área do
 * candidato, upload de currículo e LinkedIn. Ter uma porta só é o que evita o
 * problema que existia antes — dois caminhos gravando "perfil" em lugares
 * diferentes, com vocabulários diferentes, sem um ver o outro.
 *
 * Fonte de verdade: `candidateProfiles`. O doc `users/{uid}` recebe um ESPELHO
 * de `occupation`, `countryOfResidence` e `countriesOfInterest` — hunting,
 * VIEWs do selfhosted e as projeções (`public_interviews`, `companyInterviews`)
 * leem esses campos de lá, e espelhar preserva tudo isso funcionando.
 *
 * CPF (opcional, TOS-013): quando informado no patch, alimenta a camada
 * `pessoa` via `pessoa-identity-service`. Ausência = no-op. Falha no upsert
 * não derruba o currículo (mesma regra do espelho). O valor nunca sai nas
 * respostas deste service.
 */

/** Campos espelhados em users/{uid} — nada além disso deve ser duplicado. */
const MIRRORED_FIELDS = ['occupation', 'countryOfResidence', 'countriesOfInterest'] as const

/** Peso de cada campo no cálculo de completude (soma 100). */
const COMPLETENESS_WEIGHTS: Array<{ field: keyof CandidateProfile; weight: number }> = [
	{ field: 'name', weight: 8 },
	{ field: 'occupation', weight: 12 },
	{ field: 'level', weight: 8 },
	{ field: 'location', weight: 6 },
	{ field: 'headline', weight: 6 },
	{ field: 'summary', weight: 12 },
	{ field: 'skills', weight: 12 },
	{ field: 'experiences', weight: 16 },
	{ field: 'education', weight: 8 },
	{ field: 'languages', weight: 4 },
	{ field: 'professionalObjectives', weight: 4 },
	{ field: 'resumeUrl', weight: 4 },
]

function isFilled(value: unknown): boolean {
	if (value == null) return false
	if (Array.isArray(value)) return value.length > 0
	if (typeof value === 'string') return value.trim().length > 0
	if (typeof value === 'number') return true
	return Object.keys(value as object).length > 0
}

/** Remove CPF do objeto de saída — PII não pode vazar pra API/logs de resposta. */
function omitCpf(profile: CandidateProfile): CandidateProfile {
	const { cpf: _cpf, ...safe } = profile
	return safe
}

export function computeCompleteness(profile: Partial<CandidateProfile>): number {
	const earned = COMPLETENESS_WEIGHTS.reduce(
		(total, { field, weight }) => (isFilled(profile[field]) ? total + weight : total),
		0,
	)
	return Math.min(100, earned)
}

/** Campos que faltam, do mais pesado pro mais leve — orienta o que pedir primeiro. */
export function missingFields(profile: Partial<CandidateProfile>): string[] {
	return [...COMPLETENESS_WEIGHTS]
		.sort((a, b) => b.weight - a.weight)
		.filter(({ field }) => !isFilled(profile[field]))
		.map(({ field }) => String(field))
}

export function createCandidateProfileService(infra: InfraProvider) {
	const taxonomy = createTaxonomyService(infra)

	const pessoaService = createPessoaService(infra)

	/**
	 * Perfil completo: `candidateProfiles` como base, identidade vinda de
	 * `users/{uid}`, e fallback para os campos que só existem no doc do usuário
	 * (candidatos anteriores ao currículo vivo, ou criados por outros canais).
	 */
	async function getProfile(userId: string): Promise<CandidateProfile> {
		const [stored, user] = await Promise.all([
			infra.userRepository.getCandidateProfile(userId).catch(() => null) as Promise<CandidateProfile | null>,
			infra.userRepository.getUser(userId).catch(() => null) as Promise<User | null>,
		])

		const legacy = (user ?? {}) as Record<string, unknown>
		const base = (stored ?? {}) as Partial<CandidateProfile>

		const profile: CandidateProfile = {
			id: userId,
			// Identidade é sempre do doc do usuário — lá é a fonte
			name: (legacy.display_name as string) ?? base.name ?? null,
			email: (legacy.email as string) ?? base.email ?? null,
			phone: (legacy.phone_number as string) ?? base.phone ?? null,
			photoUrl: (legacy.photo_url as string) ?? base.photoUrl ?? null,
			// CPF fica só no storage / camada pessoa — nunca na resposta
			cpf: undefined,

			headline: base.headline ?? null,
			summary: base.summary ?? null,
			// `profession` é o nome legado gravado pelo fluxo antigo
			occupation: base.occupation ?? base.profession ?? (legacy.occupation as string) ?? null,
			level: base.level ?? (legacy.level as string) ?? null,
			yearsOfExperience: base.yearsOfExperience ?? null,
			professionalObjectives:
				base.professionalObjectives ?? (legacy.professionalObjectives as string) ?? null,
			company: base.company ?? null,

			location: base.location ?? null,
			countryOfResidence: base.countryOfResidence ?? (legacy.countryOfResidence as string) ?? null,
			countriesOfInterest:
				base.countriesOfInterest ?? (legacy.countriesOfInterest as string[]) ?? null,

			skills: base.skills ?? null,
			experiences: base.experiences ?? null,
			education: base.education ?? null,
			languages: base.languages ?? null,
			certifications: base.certifications ?? null,

			resumeUrl: base.resumeUrl ?? (legacy.resumeUrl as string) ?? null,
			linkedinUrl: base.linkedinUrl ?? null,

			fieldSources: base.fieldSources ?? null,
			createdAt: base.createdAt ?? null,
			updatedAt: base.updatedAt ?? null,
		}

		profile.completeness = computeCompleteness(profile)
		return profile
	}

	return {
		getProfile,
		computeCompleteness,
		missingFields,

		/**
		 * Merge parcial do currículo. Só o que vier em `patch` muda — o resto do
		 * perfil fica intacto, porque fontes diferentes preenchem partes
		 * diferentes (o chat traz resumo, o LinkedIn traz experiências).
		 *
		 * Se `patch.cpf` vier preenchido, chama o upsert da camada `pessoa`
		 * (TOS-013). Sem CPF = no-op. Falha no upsert não impede salvar o perfil.
		 */
		async updateProfile(
			userId: string,
			patch: Partial<CandidateProfile>,
			source: CandidateProfileSource,
		): Promise<CandidateProfile> {
			const current = await getProfile(userId)
			// getProfile já stripa CPF; recupera o valor persistido pra não apagar
			// em updates que não mandam CPF de novo.
			const stored = (await infra.userRepository
				.getCandidateProfile(userId)
				.catch(() => null)) as CandidateProfile | null
			const storedCpf = stored?.cpf ?? null

			const cpfFromPatch =
				typeof patch.cpf === 'string' && patch.cpf.trim().length > 0
					? patch.cpf.trim()
					: null

			const changedFields = Object.keys(patch).filter(
				(key) => patch[key as keyof CandidateProfile] !== undefined,
			)
			const fieldSources: Record<string, CandidateProfileSource> = {
				...(current.fieldSources ?? {}),
			}
			for (const field of changedFields) {
				// Não registra origem de CPF em fieldSources exposto na resposta
				if (field === 'cpf') continue
				fieldSources[field] = source
			}

			const { cpf: _ignoredCpf, ...patchWithoutCpf } = patch
			const merged: CandidateProfile = {
				...current,
				...patchWithoutCpf,
				id: userId,
				// Persiste CPF só quando veio no patch; senão mantém o armazenado
				cpf: cpfFromPatch ?? storedCpf,
				fieldSources,
				updatedAt: new Date(),
			}
			// `profession` é legado: normaliza pra não divergir de `occupation`
			if (patch.profession && !patch.occupation) merged.occupation = patch.profession
			merged.profession = undefined
			merged.completeness = computeCompleteness(merged)

			/*
			 * Ocupação canônica (V2-803) — ao lado do texto, nunca no lugar.
			 * `occupation` continua sendo o que a pessoa escreveu e o que a tela
			 * mostra; o código é insumo de busca e do ranking do F3. Se não casar,
			 * o campo não é gravado: distinguir "não casou" de "nunca tentei" é o
			 * que permite reprocessar com taxonomia nova depois.
			 */
			if (merged.occupation) {
				const match = await taxonomy
					.resolveOccupation(merged.occupation as string)
					.catch(() => null)
				if (match) {
					merged.occupationCode = match.occupation.id
					merged.taxonomyVersion = match.occupation.taxonomyVersion
				}
			}

			const exists = stored
			if (exists) {
				await infra.userRepository.updateCandidateProfile(userId, merged as never)
			} else {
				await infra.userRepository.createCandidateProfile(
					{ ...merged, createdAt: new Date() } as never,
					userId,
				)
			}

			// Espelho em users/{uid}: hunting, VIEWs e projeções leem de lá.
			// Só os 3 campos — espelhar o currículo inteiro inflaria um doc que é
			// lido em toda a plataforma só pra pegar nome e foto.
			const mirror: Record<string, unknown> = {}
			for (const field of MIRRORED_FIELDS) {
				if (merged[field] !== undefined && merged[field] !== null) {
					mirror[field] = merged[field]
				}
			}
			if (Object.keys(mirror).length > 0) {
				await infra.userRepository.updateUser(userId, mirror).catch((error) => {
					// Espelho é derivado: falhar aqui não pode perder o currículo,
					// mas precisa ser visível porque degrada o hunting.
					console.error('[CandidateProfile] mirror to users failed:', error)
				})
			}

			// Camada pessoa (TOS-013): só quando o candidato INFORMAR CPF neste
			// patch. Ausência = no-op. Falha = loga resultado e segue (derivada).
			if (cpfFromPatch) {
				try {
					await pessoaService.upsertByCpf({
						cpf: cpfFromPatch,
						userId,
						candidateProfileId: userId,
						displayName: merged.name ?? undefined,
					})
				} catch (error) {
					const message = error instanceof Error ? error.message : 'unknown'
					console.error('[CandidateProfile] pessoa upsert failed:', message)
				}
			}

			return omitCpf(merged)
		},
	}
}

export type CandidateProfileService = ReturnType<typeof createCandidateProfileService>
