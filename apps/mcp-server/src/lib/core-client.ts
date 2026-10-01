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
	init: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = { method: 'GET' },
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
	/**
	 * "O que preciso estudar" (F3): skills que as vagas abertas pedem e o
	 * perfil não tem, por número de vagas. Regra, não modelo.
	 */
	studyGaps?: {
		jobsConsidered: number
		gaps: Array<{ skill: string; jobs: number }>
		reason: 'no_profile_skills' | 'no_matching_jobs' | null
	}
	/**
	 * Assuntos que empresas procuraram nas gravações da pessoa e ela ainda não
	 * falou — só o assunto e quantas empresas, a partir de duas.
	 */
	askedTopics?: Array<{ topic: string; companies: number; lastAskedAt: string }>
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

/* ─── A rede do candidato (COP-22 / COP-12): projetos, perfil aberto, vitrine ───
 *
 * Tudo aqui é a MESMA rota que a área do candidato chama — nenhum caminho
 * paralelo de escrita. Publicar pelo assistente passa pela mesma curadoria
 * (COP-14) porque é o core que a dispara, não a tela.
 */

export type CandidateProjectType = 'link' | 'repo' | 'images' | 'pdf'
export interface CandidateProject {
	id: string
	title: string
	description: string | null
	type: CandidateProjectType
	order: number
	link: string | null
	repo: string | null
	images: string[] | null
	pdf: string | null
}
export function listProjects(userToken: string) {
	return request<{ projects: CandidateProject[] }>('/dream-jobs/projects', userToken)
}
export function createProject(userToken: string, body: Record<string, unknown>) {
	return request<{ project: CandidateProject }>('/dream-jobs/projects', userToken, { method: 'POST', body })
}
export function updateProject(userToken: string, id: string, body: Record<string, unknown>) {
	return request<{ project: CandidateProject }>(`/dream-jobs/projects/${encodeURIComponent(id)}`, userToken, { method: 'PATCH', body })
}
export function deleteProject(userToken: string, id: string) {
	return request<{ deleted: boolean }>(`/dream-jobs/projects/${encodeURIComponent(id)}`, userToken, { method: 'DELETE' })
}
export function reorderProjects(userToken: string, ids: string[]) {
	return request<{ projects: CandidateProject[] }>('/dream-jobs/projects/reorder', userToken, { method: 'POST', body: { ids } })
}

export type ModerationState = 'pending' | 'approved' | 'rejected' | 'removed'
export interface PublicProfileItem {
	id: string
	type: 'profile' | 'project' | 'answer' | 'link'
	projectId?: string | null
	jobAppliedId?: string | null
	answerId?: string | null
	url?: string | null
	withFeedback: boolean
	publishedAt: string
	moderation: { state: ModerationState; reasons: string[]; caseId: string | null; updatedAt: string } | null
}
export interface PublicProfile {
	handle: string | null
	availability: 'available' | 'open_to_talk' | 'hidden'
	items: PublicProfileItem[]
	revokedAt: string | null
	consentVersion: string
}
export function getPublicProfile(userToken: string) {
	return request<PublicProfile>('/dream-jobs/public-profile', userToken)
}
export function checkPublicProfileHandle(userToken: string, handle: string) {
	return request<{ available: boolean; reason: 'invalid' | 'reserved' | 'taken' | 'locked' | null }>(
		`/dream-jobs/public-profile/handle-availability?handle=${encodeURIComponent(handle)}`, userToken,
	)
}
export function setPublicProfileHandle(userToken: string, handle: string) {
	return request<PublicProfile>('/dream-jobs/public-profile/handle', userToken, { method: 'PUT', body: { handle } })
}
export function setPublicProfileAvailability(userToken: string, availability: PublicProfile['availability']) {
	return request<PublicProfile>('/dream-jobs/public-profile/availability', userToken, { method: 'PUT', body: { availability } })
}
export function publishPublicProfileItem(userToken: string, body: Record<string, unknown>) {
	return request<PublicProfile>('/dream-jobs/public-profile/items', userToken, { method: 'POST', body })
}
export function removePublicProfileItem(userToken: string, itemId: string) {
	return request<{ ok: boolean }>(`/dream-jobs/public-profile/items/${encodeURIComponent(itemId)}`, userToken, { method: 'DELETE' })
}
export function revokePublicProfile(userToken: string) {
	return request<{ ok: boolean }>('/dream-jobs/public-profile/revoke', userToken, { method: 'POST' })
}

export interface ShowcaseItemRef { jobAppliedId: string; answerId: string; withFeedback?: boolean }
export interface Showcase {
	token: string
	url: string
	items: ShowcaseItemRef[]
	headline: string | null
	expiresAt: string | null
	expired: boolean
	viewsTotal: number
}
export function getMyShowcase(userToken: string) {
	return request<{ showcase: Showcase | null }>('/showcase', userToken)
}
export function publishShowcase(userToken: string, body: { items: ShowcaseItemRef[]; headline?: string | null; expiresInDays?: number | null }) {
	return request<{ showcase: Showcase }>('/showcase', userToken, { method: 'POST', body })
}
export function revokeShowcase(userToken: string) {
	return request<{ revoked: boolean }>('/showcase/revoke', userToken, { method: 'POST' })
}

export interface InterviewAnswer {
	id: string
	question: string
	videoUrl: string | null
	answer: string | null
	feedback: string | null
	strengths: string[]
	improvement: string[]
	skipped?: boolean
}
export function listInterviewAnswers(userToken: string, jobAppliedId: string) {
	return request<{ answers: InterviewAnswer[] }>(`/interviews/mine/${encodeURIComponent(jobAppliedId)}/answers`, userToken)
}

export type AttestationTier = 'existence' | 'summary' | 'full'
export interface Attestation {
	jti: string
	tier: AttestationTier
	jws: string
	statusUrl: string
	issuedAt: string
	expiresAt: string | null
	revokedAt: string | null
	companyName: string | null
	jobTitle: string | null
}
export function listAttestations(userToken: string) {
	return request<{ attestations: Attestation[] }>('/ots/attestations', userToken)
}
export function issueAttestation(userToken: string, body: { jobAppliedId: string; tier: AttestationTier; expiresInDays?: number | null }) {
	return request<Attestation>('/ots/attestations', userToken, { method: 'POST', body })
}
export function revokeAttestation(userToken: string, jti: string) {
	return request<{ revoked: boolean }>(`/ots/attestations/${encodeURIComponent(jti)}/revoke`, userToken, { method: 'POST' })
}

export function exportProfile(userToken: string) {
	return request<{ otsVersion: string; exportedAt: string; profile: Record<string, unknown> }>('/dream-jobs/profile/export', userToken)
}

/** OTS 0.3 — propostas de horário e retornos, como o core entrega ao talento. */
export interface MySchedule {
	id: string
	companyId: string
	jobId: string
	jobAppliedId: string
	jobName: string | null
	companyName: string | null
	format: 'video_call' | 'phone' | 'onsite'
	durationMinutes: number
	timezone: string
	slots: Array<{ start: string; end: string }>
	status: 'proposed' | 'confirmed' | 'declined' | 'expired' | 'cancelled'
	confirmedSlot: { start: string; end: string } | null
	expiresAt: string | null
	note: string | null
	joinDetails: { meetingUrl: string | null; address: string | null; instructions: string | null } | null
	declineReason: 'no_slot_fits' | 'not_interested' | 'accepted_other_offer' | 'other' | null
	declineNote: string | null
	respondedAt: string | null
	respondedVia: 'candidate_area' | 'agent' | null
	createdAt: string
	updatedAt: string
}

export type ScheduleResponse =
	| { action: 'confirm'; slotStart: string }
	| { action: 'decline'; reason: 'no_slot_fits' | 'not_interested' | 'accepted_other_offer' | 'other'; note?: string | null }

export interface MyProcessFeedback {
	id: string
	companyId: string
	jobId: string
	jobAppliedId: string
	jobName: string | null
	companyName: string | null
	stage: 'received' | 'in_review' | 'interview_scheduled' | 'advanced' | 'not_selected' | 'hired' | 'position_closed' | 'withdrawn'
	message: string
	reasonCode: 'requirements_not_met' | 'insufficient_experience' | 'salary_mismatch' | 'position_cancelled' | 'other_candidate_hired' | null
	nextStep: string | null
	sentAt: string
}

export function listMySchedules(userToken: string) {
	return request<{ schedules: MySchedule[] }>('/interviews/mine/schedules', userToken)
}

/** O agente respondeu: o core grava `respondedVia: agent`. */
export function respondToSchedule(userToken: string, scheduleId: string, body: ScheduleResponse) {
	return request<MySchedule>(`/interviews/mine/schedules/${encodeURIComponent(scheduleId)}/respond?via=agent`, userToken, {
		method: 'POST',
		body,
	})
}

export function listMyProcessFeedback(userToken: string, jobAppliedId?: string) {
	const query = jobAppliedId ? `?jobAppliedId=${encodeURIComponent(jobAppliedId)}` : ''
	return request<{ feedback: MyProcessFeedback[] }>(`/interviews/mine/feedback${query}`, userToken)
}
