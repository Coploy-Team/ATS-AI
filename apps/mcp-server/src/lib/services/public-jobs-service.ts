import type { PostJob } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { jobEntryUrl } from '@/lib/job-entry-link'

/**
 * Idiomas suportados pelo canal MCP na fase 0. O campo `language` da vaga
 * guarda valores mistos no legado ('pt', 'pt-BR', 'en'...) — a comparação
 * normaliza pelo prefixo ISO-639-1.
 */
export type SupportedLanguage = 'pt-BR' | 'en'

export interface SearchJobsResult {
	jobs: PublicJobSummary[]
	/** Total de vagas que casam com o filtro (antes do limit) — habilita "mostrar mais". */
	totalAvailable: number
}

export interface SearchJobsParams {
	/** Texto livre (cargo, skill, cidade...). Tokens combinados com AND. */
	query?: string
	language?: SupportedLanguage
	limit?: number
}

/**
 * Projeção pública de uma vaga — whitelist estrita. Nunca expor aqui:
 * jobQuestions/additionalQuestions (conteúdo da entrevista), evaluation,
 * competências internas, creatorEmail/creatorId, usersApplied.
 */
export interface PublicJobSummary {
	jobId: string
	companyId: string
	/** Campo do PROTOCOLO (OTS 0.1 §2.1). A suíte de conformidade valida por ele. */
	title: string
	/** @deprecated Nome interno vazado pro wire antes do artefato ; o widget ainda lê. Sai na 0.2. */
	jobName: string
	companyName: string | null
	/** Logo da empresa (doc Company.companLogo) — consumido pelo widget de cards. */
	companyLogo: string | null
	location: string | null
	workModality: string | null
	employmentType: string | null
	careerLevel: string | null
	language: string | null
	salary: string | null
	mainSkills: string | null
	postedAt: string | null
	/** null quando a instalação não tem Motor nem portal — a tool explica. */
	interviewUrl: string | null
}

export interface PublicJobDetails extends PublicJobSummary {
	description: string | null
	requirements: string | null
	responsibilities: string | null
	benefits: string | null
	companyDescription: string | null
	contractType: string | null
	jobHours: string | null
	educationalRequirements: string[] | null
	requiresPreviousExperience: boolean | null
	closingDate: string | null
	interviewMode: string | null
	/** Quantidade de perguntas da entrevista — nunca o conteúdo. */
	questionCount: number
}

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
/** Cap de leitura no repositório — filtros de negócio rodam em memória. */
const REPOSITORY_FETCH_CAP = 200

function normalizeLanguage(value: string | null | undefined): string | null {
	if (!value) return null
	return value.trim().toLowerCase().split(/[-_]/)[0] || null
}

/** Firestore Timestamp | Date | string ISO → string ISO (convenção: response sempre ISO). */
function toIso(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
	if (typeof value === 'string') {
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? null : date.toISOString()
	}
	if (typeof value === 'object') {
		const ts = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
		if (typeof ts.toDate === 'function') return toIso(ts.toDate())
		const seconds = ts._seconds ?? ts.seconds
		if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
	}
	return null
}

const COUNTRY_NAMES: Record<string, string> = {
	br: 'Brasil',
	pt: 'Portugal',
	us: 'United States',
	ca: 'Canada',
}

/**
 * Endereço vem sujo do form (campos vazios, "-" como placeholder, país em
 * sigla minúscula). Sem limpeza o card mostra "-, -, br".
 */
function formatLocation(job: PostJob): string | null {
	const address = job.address
	const clean = (value: string | null | undefined): string | null => {
		const trimmed = value?.trim() ?? ''
		if (!trimmed || /^-+$/.test(trimmed)) return null
		return trimmed
	}
	const country = clean(address?.country)
	const parts = [
		clean(address?.city),
		clean(address?.state),
		country && country.length === 2 ? COUNTRY_NAMES[country.toLowerCase()] ?? country.toUpperCase() : country,
	].filter((part): part is string => part != null)
	return parts.length > 0 ? parts.join(', ') : null
}


function isOpenPublicJob(job: PostJob): boolean {
	// Vaga-espelho da entrevista de perfil: não é oportunidade de empresa, é o
	// perfil de um candidato. Já nasce public=false, mas o guard fica explícito
	// porque docs legados do fluxo antigo foram criados com public=true.
	if (job.profileInterview === true) return false
	if (job.public !== true) return false
	if (job.stopped === true || job.archived === true) return false
	const closingIso = toIso(job.closingDate)
	if (closingIso && new Date(closingIso).getTime() < Date.now()) return false
	return true
}

function matchesLanguage(job: PostJob, language?: SupportedLanguage): boolean {
	if (!language) return true
	const jobLanguage = normalizeLanguage(job.language)
	// Vaga sem idioma definido é legado pt-BR (default do form de vaga)
	if (!jobLanguage) return language === 'pt-BR'
	return jobLanguage === normalizeLanguage(language)
}

function matchesQuery(job: PostJob, query?: string): boolean {
	if (!query?.trim()) return true
	const haystack = [
		job.jobName,
		job.companyName,
		job.mainSkills,
		job.jobCategories,
		job.carrerLevel,
		job.workModality,
		job.jobModel,
		job.employmentType,
		job.address?.city,
		job.address?.state,
		job.address?.country,
	]
		.filter((part): part is string => typeof part === 'string')
		.join(' ')
		.toLowerCase()
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((token) => haystack.includes(token))
}

function toSummary(job: PostJob & { companyId: string }, companyLogo: string | null = null): PublicJobSummary {
	return {
		jobId: job.id,
		companyId: job.companyId,
		title: job.jobName ?? '',
		jobName: job.jobName ?? '',
		companyName: job.companyName ?? null,
		companyLogo,
		location: formatLocation(job),
		workModality: job.workModality ?? job.jobModel ?? null,
		employmentType: job.employmentType ?? null,
		careerLevel: job.carrerLevel ?? null,
		language: job.language ?? null,
		salary: job.jobDescriptionMetadata?.salary ?? null,
		mainSkills: job.mainSkills ?? null,
		postedAt: toIso(job.timeCreated),
		interviewUrl: jobEntryUrl(job.id, job.companyId),
	}
}

export function createPublicJobsService(infra: InfraProvider) {
	return {
		async searchJobs(params: SearchJobsParams = {}): Promise<SearchJobsResult> {
			const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
			const jobs = await infra.jobRepository.listPublicJobs({ limit: REPOSITORY_FETCH_CAP })
			const matching = jobs
				.filter(isOpenPublicJob)
				.filter((job) => matchesLanguage(job, params.language))
				.filter((job) => matchesQuery(job, params.query))
			const selected = matching.slice(0, limit)

			// Logos: 1 fetch por empresa distinta do resultado (não por vaga)
			const companyIds = [...new Set(selected.map((job) => job.companyId))]
			const logoEntries = await Promise.all(
				companyIds.map(async (companyId) => {
					const company = await infra.companyRepository.getCompany(companyId).catch(() => null)
					return [companyId, company?.companLogo ?? null] as const
				}),
			)
			const logoByCompany = new Map(logoEntries)

			return {
				jobs: selected.map((job) => toSummary(job, logoByCompany.get(job.companyId) ?? null)),
				totalAvailable: matching.length,
			}
		},

		async getJobDetails(companyId: string, jobId: string): Promise<PublicJobDetails | null> {
			const job = await infra.jobRepository.getJob(companyId, jobId)
			// Guard: lookup por ID não pode vazar vaga privada/encerrada
			if (!job || !isOpenPublicJob(job)) return null
			const company = await infra.companyRepository.getCompany(companyId).catch(() => null)
			return {
				...toSummary({ ...job, companyId }, company?.companLogo ?? null),
				description: job.generatedJobDescription ?? job.jobDescription ?? null,
				requirements: job.jobRequirements ?? null,
				responsibilities: job.jobResponsibilities ?? job.jobResponsabilities ?? null,
				benefits: job.jobDescriptionMetadata?.benefits ?? null,
				companyDescription: job.jobDescriptionMetadata?.companyDescription ?? null,
				contractType: job.contractType ?? null,
				jobHours: job.jobHours ?? null,
				educationalRequirements: job.educationalRequiements ?? null,
				requiresPreviousExperience: job.requiresPreviousExperience ?? null,
				closingDate: toIso(job.closingDate),
				interviewMode: job.interviewMode ?? null,
				questionCount: job.jobQuestions?.length ?? 0,
			}
		},
	}
}

export type PublicJobsService = ReturnType<typeof createPublicJobsService>
