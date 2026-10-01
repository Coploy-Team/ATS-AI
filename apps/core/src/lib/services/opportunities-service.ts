import type { CandidateProfile, Company, JobApplied, PostJob } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import {
	computeCompatibility,
	normalizeToken,
	resolveModality,
	type Compatibility,
} from '@/lib/compatibility'
import { createCandidateProfileService } from './candidate-profile-service'
import {
	createCareersService,
	isOpenPublicJob,
	NOT_AN_OPENING,
	requiresApplicationForm,
	toSummary,
	type CareersJobDetails,
	type CareersJobSummary,
} from './careers-service'

/**
 * Feed de oportunidades do candidato (COP-11).
 *
 * As vagas são as MESMAS que o portal e o `search_jobs` do MCP servem —
 * públicas, abertas, sem a vaga-espelho da entrevista de perfil. O que este
 * serviço acrescenta é o candidato: a compatibilidade determinística com o
 * perfil dele, se ele já se candidatou, e os filtros do card. Nada de modelo.
 */

export interface OpportunityFilters {
	query?: string | null
	workModality?: string | null
	location?: string | null
	occupation?: string | null
	/** Qualificação: a vaga precisa pedir esta skill (mesma leitura das tags). */
	skill?: string | null
	minCompatibility?: number | null
	limit?: number | null
}

export interface Opportunity extends CareersJobSummary {
	companyName: string
	companyLogo: string | null
	compatibility: Compatibility
	/** O candidato já entrou nesta vaga (candidatura ou entrevista). */
	applied: boolean
}

export interface OpportunityDetails extends CareersJobDetails {
	companyName: string
	companyLogo: string | null
	compatibility: Compatibility
	applied: boolean
	processStages: Array<{ id: string; order: number; label: string; labelEn: string }>
	/** A vaga aceita o perfil Coploy no lugar da entrevista (F5); ausente na vaga = aceita. */
	acceptsCoployProfile: boolean
}

const FETCH_CAP = 200
/** Quantas entradas recentes o "último match" percorre antes de desistir. */
const LATEST_MATCH_LOOKBACK = 10

/**
 * "Último match" do perfil aberto (F4): a compatibilidade do COP-11 contra a
 * vaga real mais recente em que a pessoa entrou. Só número e mês — o título da
 * vaga fica de fora porque às vezes carrega o nome da empresa, e a página
 * aberta nunca diz de que empresa foi o processo (decisão de 29/09).
 */
export interface LatestMatch {
	score: number
	/** YYYY-MM da entrada na vaga. */
	month: string | null
}

function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	const fromTimestamp = (value as { toDate?: () => Date }).toDate?.()
	if (fromTimestamp instanceof Date) return fromTimestamp
	const parsed = new Date(value as string)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

export interface StudyGaps {
	/** Vagas abertas que pedem ao menos uma skill que o perfil já tem. */
	jobsConsidered: number
	/** Do mais pedido para o menos, no máximo 8. */
	gaps: Array<{ skill: string; jobs: number }>
	reason: 'no_profile_skills' | 'no_matching_jobs' | null
}

function getRefId(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
		return String((value as { id?: unknown }).id ?? '') || null
	}
	return null
}

function includesText(haystack: string | null | undefined, needle: string | null | undefined): boolean {
	if (!needle) return true
	if (!haystack) return false
	return normalizeToken(haystack).includes(normalizeToken(needle))
}

export function createOpportunitiesService(infra: InfraProvider) {
	const profiles = createCandidateProfileService(infra)
	const careers = createCareersService(infra)

	async function appliedJobIds(userId: string): Promise<Set<string>> {
		const list = (await infra.candidateRepository
			.listJobsApplied(userId, {})
			.catch(() => [])) as JobApplied[]
		return new Set(list.map((item) => getRefId(item.jobApplied)).filter((id): id is string => Boolean(id)))
	}

	/** Uma leitura por empresa distinta, não por vaga. */
	async function companiesOf(jobs: Array<{ companyId: string }>): Promise<Map<string, Company | null>> {
		const ids = [...new Set(jobs.map((j) => j.companyId))]
		const entries = await Promise.all(
			ids.map(async (id) => [id, (await infra.companyRepository.getCompany(id).catch(() => null)) as Company | null] as const),
		)
		return new Map(entries)
	}

	function decorate(job: PostJob & { companyId: string }, company: Company | null, profile: CandidateProfile, applied: Set<string>): Opportunity {
		const summary = toSummary(job.companyId, job, company ? requiresApplicationForm(company, job) : false)
		return {
			...summary,
			companyName: company?.companyName ?? '',
			companyLogo: company?.companLogo ?? null,
			compatibility: computeCompatibility(profile, job),
			applied: applied.has(job.id),
		}
	}

	return {
		async list(userId: string, filters: OpportunityFilters = {}): Promise<{ jobs: Opportunity[]; total: number }> {
			const [profile, applied, raw] = await Promise.all([
				profiles.getProfile(userId),
				appliedJobIds(userId),
				infra.jobRepository.listPublicJobs({ limit: FETCH_CAP }) as Promise<Array<PostJob & { companyId: string }>>,
			])
			const open = raw.filter(isOpenPublicJob)
			const companies = await companiesOf(open)

			const wantedModality = resolveModality(filters.workModality)
			const minCompatibility = filters.minCompatibility ?? null

			const jobs = open
				.map((job) => decorate(job, companies.get(job.companyId) ?? null, profile, applied))
				.filter((item) => {
					if (filters.query && !(includesText(item.title, filters.query) || includesText(item.companyName, filters.query))) return false
					if (filters.occupation && !includesText(item.title, filters.occupation)) return false
					if (filters.location && !includesText(item.location, filters.location)) return false
					if (wantedModality && resolveModality(item.workModality) !== wantedModality) return false
					if (filters.skill) {
						const wanted = normalizeToken(filters.skill)
						const asks = item.compatibility.tags.some(
							(tag) => tag.kind === 'skill' && (normalizeToken(tag.label).includes(wanted) || wanted.includes(normalizeToken(tag.label))),
						)
						if (!asks) return false
					}
					// compatibilidade mínima só corta quem TEM compatibilidade calculada:
					// perfil sem dado não pode sumir do feed por um número que não existe
					if (minCompatibility !== null && item.compatibility.score !== null && item.compatibility.score < minCompatibility) return false
					return true
				})
				// maior compatibilidade primeiro; sem número, a mais recente
				.sort((a, b) => {
					const sa = a.compatibility.score ?? -1
					const sb = b.compatibility.score ?? -1
					if (sb !== sa) return sb - sa
					return (b.postedAt ?? '').localeCompare(a.postedAt ?? '')
				})

			const limit = Math.max(1, Math.min(filters.limit ?? 50, 100))
			return { jobs: jobs.slice(0, limit), total: jobs.length }
		},

		/**
		 * "O que preciso estudar" (F3): as skills que as vagas abertas pedem e o
		 * perfil não tem, contadas por quantas vagas pedem cada uma. Só entram as
		 * vagas que já pedem ALGO que a pessoa tem — é o recorte de "área" sem
		 * inventar taxonomia: evidência, não rótulo. Determinístico; o plano de
		 * estudo fica com o assistente do candidato (COP-12).
		 */
		/**
		 * Percorre as entradas mais recentes e devolve a primeira que dá número.
		 * Vaga-espelho de perfil, avaliação e desligamento não são vaga; vaga que
		 * não listou skills não dá número (regra do COP-11) e passa para a próxima.
		 */
		async latestMatch(userId: string): Promise<LatestMatch | null> {
			const entries = ((await infra.candidateRepository.listJobsApplied(userId, {}).catch(() => [])) as JobApplied[])
				.map((entry) => ({ entry, at: toDate(entry.appliedTime) ?? toDate(entry.finishedTime) }))
				.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
				.slice(0, LATEST_MATCH_LOOKBACK)
			if (entries.length === 0) return null
			const profile = await profiles.getProfile(userId)
			for (const { entry, at } of entries) {
				const companyId = getRefId(entry.companyOwner)
				const jobId = getRefId(entry.jobApplied)
				if (!companyId || !jobId) continue
				const job = (await infra.jobRepository.getJob(companyId, jobId).catch(() => null)) as PostJob | null
				if (!job || job.profileInterview === true) continue
				if (job.typeInterview && NOT_AN_OPENING.has(job.typeInterview)) continue
				const { score } = computeCompatibility(profile, job)
				if (score === null) continue
				return { score, month: at ? at.toISOString().slice(0, 7) : null }
			}
			return null
		},

		async studyGaps(userId: string): Promise<StudyGaps> {
			const [profile, raw] = await Promise.all([
				profiles.getProfile(userId),
				infra.jobRepository.listPublicJobs({ limit: FETCH_CAP }) as Promise<Array<PostJob & { companyId: string }>>,
			])
			const hasSkills = (profile.skills ?? []).length > 0 || (profile.skillDetails ?? []).length > 0
			if (!hasSkills) return { jobsConsidered: 0, gaps: [], reason: 'no_profile_skills' }

			const counts = new Map<string, { skill: string; jobs: number }>()
			let considered = 0
			for (const job of raw.filter(isOpenPublicJob)) {
				const compatibility = computeCompatibility(profile, job)
				const skillTags = compatibility.tags.filter((tag) => tag.kind === 'skill')
				if (!skillTags.some((tag) => tag.matched)) continue
				considered++
				for (const tag of skillTags) {
					if (tag.matched) continue
					const key = normalizeToken(tag.label)
					const entry = counts.get(key) ?? { skill: tag.label, jobs: 0 }
					entry.jobs++
					counts.set(key, entry)
				}
			}
			const gaps = [...counts.values()].sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill)).slice(0, 8)
			return { jobsConsidered: considered, gaps, reason: considered === 0 ? 'no_matching_jobs' : null }
		},

		async get(userId: string, companyId: string, jobId: string): Promise<OpportunityDetails | null> {
			const [profile, applied, result] = await Promise.all([
				profiles.getProfile(userId),
				appliedJobIds(userId),
				careers.getJob(companyId, jobId),
			])
			if (!result) return null
			const company = (await infra.companyRepository.getCompany(companyId).catch(() => null)) as Company | null
			const job = (await infra.jobRepository.getJob(companyId, jobId).catch(() => null)) as PostJob | null
			return {
				...result.job,
				companyName: company?.companyName ?? result.branding.companyName ?? '',
				companyLogo: company?.companLogo ?? result.branding.logoUrl ?? null,
				compatibility: computeCompatibility(profile, job ?? {}),
				applied: applied.has(jobId),
				acceptsCoployProfile: job?.acceptsCoployProfile !== false,
			}
		},
	}
}

export type OpportunitiesService = ReturnType<typeof createOpportunitiesService>
