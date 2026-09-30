import { env } from '@/env'

/**
 * Cliente HTTP do orchestrator. `GET /interview/session` é o "apply" real da
 * plataforma: cria o jobApplied se não existir (create-if-not-exists), faz o
 * sync de views/usersApplied e dispara o webhook de nova candidatura.
 */

export interface InterviewSessionResponse {
	id: string
	company: { name: string; description: string; logoURL: string }
	job: {
		name: string
		awserQuestion: number
		totalQuestion: number
		done: boolean
		archived: boolean
		stopped: boolean
		language: string
		typeInterview: string
		interviewMode: string
	}
}

export async function getInterviewSession(
	companyId: string,
	postJobId: string,
	userToken: string,
): Promise<InterviewSessionResponse | null> {
	// Concatenação (não new URL(path, base)) — a base pode ter path prefix
	// (ex.: https://api-hml.coploy.io/orchestrator atrás do LB) que o
	// construtor de URL descartaria com path absoluto.
	// sem Motor não há orchestrator — as tools de entrevista param antes de chegar aqui
	if (!env.ORCHESTRATOR_BASE_URL) throw new Error('Interview engine not installed (ORCHESTRATOR_BASE_URL is empty)')
	const base = env.ORCHESTRATOR_BASE_URL.replace(/\/$/, '')
	const url = new URL(`${base}/interview/session`)
	url.searchParams.set('company', companyId)
	url.searchParams.set('postJob', postJobId)
	// origem do funil (V2-601): quem entra por aqui veio do plugin
	url.searchParams.set('source', 'mcp')

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${userToken}` },
		signal: AbortSignal.timeout(30_000),
	})

	if (!response.ok) {
		console.error('[Orchestrator] interview/session failed:', response.status, await response.text().catch(() => ''))
		return null
	}

	const data = (await response.json().catch(() => null)) as InterviewSessionResponse | null
	return data?.id ? data : null
}
