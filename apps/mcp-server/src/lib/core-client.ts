import type { CandidateProfile as DomainCandidateProfile } from '@coploy/domain'

import { env } from '@/env'

/**
 * Cliente HTTP do core, autenticado como o candidato (ID token mintado).
 * Mesma estratégia do orchestrator-client: o canal MCP nunca reimplementa
 * regra de negócio — delega para o endpoint que o produto já expõe.
 */

const REQUEST_TIMEOUT_MS = 180_000

export interface ProfileInterviewStatus {
	hasInterview: boolean
	jobId: string | null
	companyId: string | null
	status: 'not_started' | 'pending' | 'in_progress' | 'completed'
	interviewUrl: string | null
	createdAt: string | null
	completedAt: string | null
}

export interface ProfileInterviewProvisionResult extends ProfileInterviewStatus {
	created: boolean
	jobName: string | null
	questionCount: number
}

/** Currículo vivo — mesmo contrato do core (`/dream-jobs/profile`). */
/**
 * O perfil é o tipo do domínio, não uma cópia à mão: campo novo no core chega
 * aqui sem ninguém editar este arquivo (COP-22 — a cópia manual foi o que
 * deixou bio/skillDetails/workModalities/availability para trás). O que o
 * core acrescenta na resposta e não vive no domínio fica na extensão.
 */
export type CandidateProfile = DomainCandidateProfile & {
	missingFields?: string[]
}

function coreUrl(path: string): string {
	// Concatenação (não new URL(path, base)) — a base pode ter path prefix do LB
	return `${env.CORE_BASE_URL.replace(/\/$/, '')}${path}`
}

async function request<T>(
	path: string,
	userToken: string,
	init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown } = { method: 'GET' },
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
	let response: Response
	try {
		response = await fetch(coreUrl(path), {
			method: init.method,
			headers: {
				Authorization: `Bearer ${userToken}`,
				/*
				 * Declara o canal para o `fieldSources` do currículo.
				 *
				 * Sem isto o core cravava `dashboard` em toda escrita, e um currículo
				 * inteiro montado por conversa ficava registrado como digitado no
				 * painel — o campo que existe para dizer a origem respondia sempre a
				 * mesma coisa. Vale para tudo que este cliente escreve; a rota que
				 * não conhece o cabeçalho simplesmente o ignora.
				 */
				'x-coploy-source': 'chat',
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
			},
			...(init.body ? { body: JSON.stringify(init.body) } : {}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[Core] ${init.method} ${path} network error:`, message)
		return { ok: false, status: 0, message }
	}

	const text = await response.text().catch(() => '')
	if (!response.ok) {
		console.error(`[Core] ${init.method} ${path} failed:`, response.status, text.slice(0, 300))
		let message = text
		try {
			message = (JSON.parse(text) as { message?: string }).message ?? text
		} catch {
			/* resposta não-JSON: mantém o texto cru */
		}
		return { ok: false, status: response.status, message }
	}

	return { ok: true, data: (text ? JSON.parse(text) : {}) as T }
}

export function getProfileInterviewStatus(userToken: string) {
	return request<ProfileInterviewStatus>('/dream-jobs/interview', userToken)
}

export function provisionProfileInterview(
	userToken: string,
	body: { occupation: string; level: string; language?: string; objectives?: string },
) {
	return request<ProfileInterviewProvisionResult>('/dream-jobs/interview', userToken, {
		method: 'POST',
		body,
	})
}

/**
 * Ticket de uso único pra abrir a entrevista já autenticado. Falha aqui não é
 * fatal: o link sem handoff simplesmente pede login.
 */
export function issueInterviewHandoff(userToken: string) {
	return request<{ code: string; expiresAt: string }>('/dream-jobs/interview/handoff', userToken, {
		method: 'POST',
	})
}

/** Entrevistas do candidato, já separadas pelo core por natureza. */
export interface CandidateInterviewSummary {
	id: string
	jobId: string | null
	companyId: string | null
	jobName: string | null
	companyName: string | null
	companyLogo: string | null
	startedAt: string | null
	completedAt: string | null
	finished: boolean
	status: 'pending' | 'in_progress' | 'completed'
	questionsAnswered: number
	questionsTotal: number
	interviewUrl: string
	feedback: {
		strengths: string[]
		development: string[]
		suggestions: string[]
	}
	rejectionExplanation?: string | null
	failedRequirementLabel?: string | null
}

export interface MyInterviews {
	profileInterview: CandidateInterviewSummary | null
	companyInterviews: CandidateInterviewSummary[]
}

export type CommunicationDimension = 'structure' | 'examples' | 'depth'

/** Insights de carreira — por contrato o core nunca devolve nota ou aprovação. */
export interface CandidateInsights {
	interviewsAnalyzed: number
	dimensionRanking: CommunicationDimension[]
	strongestDimension: CommunicationDimension | null
	dimensionToImprove: CommunicationDimension | null
	improvingDimensions: CommunicationDimension[]
	recurringStrengths: string[]
	recurringDevelopment: string[]
	suggestions: string[]
}

export function getMyInterviews(userToken: string) {
	return request<MyInterviews>('/interviews/mine', userToken)
}

export function getMyInsights(userToken: string) {
	return request<CandidateInsights>('/interviews/insights', userToken)
}

export function getCandidateProfile(userToken: string) {
	return request<CandidateProfile>('/dream-jobs/profile', userToken)
}

export function createCandidateProfile(userToken: string, body: Record<string, unknown>) {
	return request<CandidateProfile>('/dream-jobs/profile', userToken, { method: 'POST', body })
}

export function updateCandidateProfile(userToken: string, body: Record<string, unknown>) {
	return request<CandidateProfile>('/dream-jobs/profile', userToken, { method: 'PATCH', body })
}
