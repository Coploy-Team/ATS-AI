import type { Company, JobPortal, PostJob, HiringIntent } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { env } from '@/env'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { getInstallationFeatures } from '@/lib/installation-features'
import { createJobPortalService } from './job-portal-service'
import { createKanbanService } from './kanban-service'

export interface CareersBranding {
	companyName: string | null
	logoUrl: string | null
	bannerUrl: string | null
	/** Fatia vertical do banner (0–100, % do object-position). */
	bannerPosition: number | null
	primaryColor: string | null
	textColor: string | null
	/** Só as redes com link configurado — vazio = seção não aparece. */
	socialLinks: Array<{ kind: string; url: string }>
	/** "Sobre a empresa" (Markdown) da configuração do portal. */
	about: string | null
	/** Vídeo institucional (URL YouTube/Vimeo) — a tela decide o embed. */
	videoUrl: string | null
}

export interface CareersJobSummary {
	jobId: string
	companyId: string
	title: string
	location: string | null
	level: string | null
	workModality: string | null
	employmentType: string | null
	salary: string | null
	postedAt: string | null
	closingDate: string | null
	applyUrl: string
	interviewUrl: string
	/** Product signal: UI may show the short application form (backed by tenant flag applyLite). */
	shortApplicationForm: boolean
	/** Intenção declarada (V2-604). Null = vaga anterior ao campo. */
	hiringIntent: HiringIntent | null
	/** Selo de vaga verificada — comportamento, não plano contratado. */
	verified: boolean
}

export interface CareersJobDetails extends CareersJobSummary {
	description: string | null
	requirements: string | null
	responsibilities: string | null
	benefits: string | null
	companyDescription: string | null
	contractType: string | null
	jobHours: string | null
	language: string | null
	/** Pergunta e formato; a REGRA de aprovação fica no servidor. */
	knockoutQuestions: Array<{
		id: string
		question: string
		type: string
		options: string[] | null
	}>
	/** Régua da vaga sem os destinos offTrack — o caminho que o candidato percorre. */
	processStages: Array<{
		id: string
		order: number
		label: string
		labelEn: string
	}>
}

export interface CareersJobsResult {
	branding: CareersBranding
	jobs: CareersJobSummary[]
	totalAvailable: number
}

export interface CareersJobResult {
	branding: CareersBranding
	job: CareersJobDetails
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const REPOSITORY_FETCH_CAP = 200

const COUNTRY_NAMES: Record<string, string> = {
	br: 'Brasil',
	pt: 'Portugal',
	us: 'United States',
	ca: 'Canada',
}

function toIso(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
	if (typeof value === 'string') {
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? null : date.toISOString()
	}
	if (typeof value === 'object') {
		const timestamp = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
		if (typeof timestamp.toDate === 'function') return toIso(timestamp.toDate())
		const seconds = timestamp._seconds ?? timestamp.seconds
		if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
	}
	return null
}

function formatLocation(job: PostJob): string | null {
	const clean = (value: string | null | undefined): string | null => {
		const trimmed = value?.trim() ?? ''
		if (!trimmed || /^-+$/.test(trimmed)) return null
		return trimmed
	}
	const country = clean(job.address?.country)
	const parts = [
		clean(job.address?.city),
		clean(job.address?.state),
		country && country.length === 2 ? COUNTRY_NAMES[country.toLowerCase()] ?? country.toUpperCase() : country,
	].filter((part): part is string => part != null)
	return parts.length > 0 ? parts.join(', ') : null
}

function buildInterviewUrl(companyId: string, jobId: string): string {
	return `${env.INTERVIEW_BASE_URL}/job/${jobId}/company/${companyId}/login`
}

function isOpenPublicJob(job: PostJob): boolean {
	if (job.profileInterview === true) return false
	if (job.public !== true) return false
	if (job.stopped === true || job.archived === true) return false
	const closingDate = toIso(job.closingDate)
	if (closingDate && new Date(closingDate).getTime() < Date.now()) return false
	return true
}

function getRefId(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (typeof value === 'object') {
		const ref = value as { id?: unknown; _id?: unknown }
		if (typeof ref.id === 'string') return ref.id
		if (typeof ref._id === 'string') return ref._id
	}
	return null
}

function toBranding(company: Company, jobPortal: JobPortal | null): CareersBranding {
	return {
		companyName: company.companyName ?? null,
		logoUrl: jobPortal?.logoUrl ?? company.companLogo ?? null,
		bannerUrl: jobPortal?.bannerUrl ?? null,
		bannerPosition: jobPortal?.bannerPosition ?? null,
		primaryColor: jobPortal?.primaryColor ?? null,
		textColor: jobPortal?.textColor ?? null,
		socialLinks: toSocialLinks(company, jobPortal),
		about: jobPortal?.about ?? null,
		videoUrl: jobPortal?.videoUrl ?? null,
	}
}

/**
 * Lista plana e só com o que existe: a tela itera e pronto, sem conhecer o
 * catálogo de redes. `website` cai pro `companyWebsite` que a empresa já
 * preenche na tela Empresa — configurar duas vezes seria pegadinha.
 */
function toSocialLinks(company: Company, jobPortal: JobPortal | null): Array<{ kind: string; url: string }> {
	const links = jobPortal?.socialLinks ?? {}
	const withFallback = {
		website: links.website || company.companyWebsite || null,
		linkedin: links.linkedin || null,
		instagram: links.instagram || null,
		facebook: links.facebook || null,
		glassdoor: links.glassdoor || null,
	}
	return Object.entries(withFallback)
		.filter((entry): entry is [string, string] => Boolean(entry[1]))
		.map(([kind, url]) => ({ kind, url }))
}

function toSummary(companyId: string, job: PostJob, shortApplicationForm: boolean): CareersJobSummary {
	const interviewUrl = buildInterviewUrl(companyId, job.id)
	return {
		jobId: job.id,
		companyId,
		title: job.jobName ?? '',
		location: formatLocation(job),
		level: job.carrerLevel ?? null,
		workModality: job.workModality ?? job.jobModel ?? null,
		employmentType: job.employmentType ?? null,
		salary: job.salary ?? job.jobDescriptionMetadata?.salary ?? null,
		postedAt: toIso(job.timeCreated),
		closingDate: toIso(job.closingDate),
		applyUrl: interviewUrl,
		interviewUrl,
		shortApplicationForm,
		hiringIntent: job.hiringIntent ?? null,
		verified: isVerified(job),
	}
}

/**
 * "Vaga verificada" (V2-604).
 *
 * Três condições, todas de comportamento observável: a empresa ligou o
 * anti-ghosting nesta vaga, não está irregular no SLA, e declarou a intenção de
 * contratação. Selo que se compra não informa nada ao candidato — e este
 * produto está se posicionando exatamente contra isso.
 */
function isVerified(job: PostJob): boolean {
	return (
		job.antiGhostingEnabled === true &&
		!job.slaIrregularSince &&
		Boolean(job.hiringIntent)
	)
}

/**
 * Vaga com filtro de candidatura EXIGE o formulário curto.
 *
 * O filtro só tem uma tela onde caber: o formulário de candidatura. Sem ele o
 * candidato vai do link direto para o login e a entrevista, e a pergunta que o
 * recrutador configurou nunca é feita — foi exatamente o que aconteceu no
 * teste: "fiz uma vaga e não apareceu a pergunta de filtro".
 *
 * Então configurar um filtro passa a implicar o passo. É a leitura honesta do
 * que o recrutador pediu: ele quer cortar antes de gastar entrevista, e cortar
 * exige perguntar. Empresas sem filtro seguem indo direto, como antes.
 */
function requiresApplicationForm(company: Company, job: PostJob): boolean {
	if (isFeatureEnabled(company, 'applyLite')) return true
	return (job.knockoutTree?.nodes?.length ?? 0) > 0
}

function toDetails(companyId: string, job: PostJob, shortApplicationForm: boolean): CareersJobDetails {
	return {
		...toSummary(companyId, job, shortApplicationForm),
		// preenchido no getJob (resolver da régua é assíncrono); vazio = sem seção
		processStages: [],
		description: job.generatedJobDescription ?? job.jobDescription ?? null,
		requirements: job.jobRequirements ?? null,
		responsibilities: job.jobResponsibilities ?? job.jobResponsabilities ?? null,
		benefits: job.benefits ?? job.jobDescriptionMetadata?.benefits ?? null,
		companyDescription: job.jobDescriptionMetadata?.companyDescription ?? null,
		contractType: job.contractType ?? null,
		jobHours: job.jobHours ?? null,
		language: job.language ?? null,
		/*
		 * Filtro de candidatura (knockout) — a PERGUNTA, nunca a regra.
		 *
		 * O recrutador configurava "Mora em SP → reprovar automaticamente" e o
		 * candidato nunca via a pergunta: este payload é montado por allowlist
		 * explícita e o campo simplesmente não estava nela. Mesma armadilha do
		 * `orgUnitId` — o dado grava, a tela nunca recebe.
		 *
		 * Sai só `id`, `question`, `type` e `options`. `rule` e `onFail` ficam no
		 * servidor: publicar a regra é entregar o gabarito de quem responde para
		 * passar, e a decisão é avaliada no backend de qualquer forma.
		 */
		knockoutQuestions: (job.knockoutTree?.nodes ?? []).map((node) => ({
			id: node.id,
			question: node.question,
			type: node.type,
			options: node.options ?? null,
		})),
	}
}

export function createCareersService(infra: InfraProvider) {
	const jobPortalService = createJobPortalService(infra)

	async function getCompanyAndBranding(companyId: string): Promise<{ company: Company; branding: CareersBranding } | null> {
		const company = await infra.companyRepository.getCompany(companyId).catch(() => null) as Company | null
		if (!company) return null

		const jobPortalId = getRefId(company.jobPortal)
		/*
		 * Sem o ref no doc da empresa (selfhosted: `mapCompanyToRow` não tem
		 * onde gravá-lo), o elo real é o `company_id` do próprio portal — que
		 * os dois providers gravam na criação. Sem este fallback, a edição
		 * open nunca carregava banner/cor da página de carreiras.
		 */
		const jobPortal = jobPortalId
			? await jobPortalService.getJobPortal(jobPortalId).catch(() => null) as JobPortal | null
			: await infra.jobRepository.getJobPortalByCompany(companyId).catch(() => null)

		return { company, branding: toBranding(company, jobPortal) }
	}

	return {
		async listJobs(companyId: string, params: { limit?: number } = {}): Promise<CareersJobsResult | null> {
			const companyData = await getCompanyAndBranding(companyId)
			if (!companyData) return null

			const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
			const jobs = await infra.jobRepository.listPublicJobsByCompany(companyId, { limit: REPOSITORY_FETCH_CAP })
			const openJobs = jobs.filter(isOpenPublicJob)

			return {
				branding: companyData.branding,
				jobs: openJobs
					.slice(0, limit)
					.map((job) => toSummary(companyId, job, requiresApplicationForm(companyData.company, job))),
				totalAvailable: openJobs.length,
			}
		},

		async getJob(companyId: string, jobId: string): Promise<CareersJobResult | null> {
			const companyData = await getCompanyAndBranding(companyId)
			if (!companyData) return null

			const job = await infra.jobRepository.getJob(companyId, jobId)
			if (!job || !isOpenPublicJob(job)) return null

			/*
			 * Etapas do processo, públicas (padrão de mercado — Gupy mostra a
			 * régua na página da vaga). É a régua REAL da vaga, resolvida pelo
			 * mesmo serviço do board; `offTrack` (reprovado, sem resposta) fica
			 * de fora — é destino, não caminho, e o candidato está olhando o
			 * caminho. Falha aqui não derruba a página: etapas são contexto.
			 */
			const processStages = await createKanbanService(infra)
				.getKanbanConfig(companyId, jobId)
				.then((config) =>
					config.stages
						.filter((stage) => !stage.offTrack)
						.map((stage) => ({
							id: stage.id,
							order: stage.order,
							// Sem Motor a etapa `pending` NÃO é entrevista por IA — é a
							// triagem/entrevista manual da empresa. Mesma decisão de
							// vocabulário da leva do pipeline (o ats re-rotula no cliente;
							// o portal renderiza o rótulo do servidor, então é aqui).
							label:
								stage.id === 'pending' && !getInstallationFeatures().motor
									? 'Entrevista'
									: stage.label,
							labelEn:
								stage.id === 'pending' && !getInstallationFeatures().motor
									? 'Interview'
									: stage.labelEn,
						})),
				)
				.catch(() => [])

			const shortApplicationForm = requiresApplicationForm(companyData.company, job)
			return {
				branding: companyData.branding,
				job: { ...toDetails(companyId, job, shortApplicationForm), processStages },
			}
		},
	}
}

export type CareersService = ReturnType<typeof createCareersService>
