import type { InfraProvider } from '@coploy/infra'

import { jobEntryUrl } from '@/lib/job-entry-link'
import * as coreClient from '@/lib/core-client'
import { withInterviewHandoff } from '@/lib/interview-link'
import { getInterviewSession } from '@/lib/orchestrator-client'
import { createCandidateAuthService } from './candidate-auth-service'
import { createPublicJobsService } from './public-jobs-service'

/**
 * Entrevistas do candidato. Na Coploy não existe "candidatura": o candidato
 * abre o link da vaga e faz a entrevista com IA. Este service prepara a
 * sessão de entrevista (o mesmo `GET /interview/session` que os canais web e
 * WhatsApp usam) e devolve o link pra o candidato gravar no navegador.
 */

export interface InterviewSessionResult {
	jobName: string | null
	companyName: string | null
	interviewUrl: string
	questionsAnswered: number
	questionsTotal: number
	interviewFinished: boolean
	/** 'not_started' | 'in_progress' | 'finished' */
	status: 'not_started' | 'in_progress' | 'finished'
	message: string
}

export interface MyInterviewsResult {
	/** A que o candidato criou sobre a própria carreira. */
	profileInterview: coreClient.CandidateInterviewSummary | null
	/** As que ele gravou a convite de vagas reais. */
	companyInterviews: coreClient.CandidateInterviewSummary[]
	total: number
}


export function createCandidateInterviewsService(infra: InfraProvider) {
	const candidateAuthService = createCandidateAuthService(infra)
	const publicJobsService = createPublicJobsService(infra)

	return {
		/**
		 * Prepara (ou recupera) a sessão de entrevista do candidato pra uma vaga.
		 * Delega ao orchestrator — mesma máquina de negócio dos canais web/WhatsApp.
		 */
		async startInterview(uid: string, companyId: string, jobId: string): Promise<InterviewSessionResult | null> {
			// Guard: só vaga pública e aberta
			const job = await publicJobsService.getJobDetails(companyId, jobId)
			if (!job) return null

			const idToken = await candidateAuthService.mintUserIdToken(uid)
			const session = await getInterviewSession(companyId, jobId, idToken)
			if (!session) {
				throw new Error('Interview session could not be created')
			}

			// Link já autenticado — a pessoa acabou de pedir pra fazer a entrevista
			const entry = jobEntryUrl(jobId, companyId)
			if (!entry) throw new Error('Interview engine not installed')
			const interviewUrl = await withInterviewHandoff(entry, idToken)
			const answered = session.job?.awserQuestion ?? 0
			const finished = session.job?.done ?? false
			const status = finished ? 'finished' : answered > 0 ? 'in_progress' : 'not_started'

			return {
				jobName: session.job?.name ?? job.jobName,
				companyName: session.company?.name ?? job.companyName,
				interviewUrl,
				questionsAnswered: answered,
				questionsTotal: session.job?.totalQuestion ?? job.questionCount,
				interviewFinished: finished,
				status,
				message:
					'Interview session is ready. The candidate must open interviewUrl in a browser to record the AI interview — it cannot be done inside this chat.',
			}
		},

		/**
		 * Emite UM ticket de sessão pra usar no widget de vagas. O ticket
		 * autentica a sessão do candidato, não uma vaga específica — então um só
		 * serve pra qualquer link da lista, e o clique não precisa esperar tool.
		 */
		async issueSessionHandoff(uid: string): Promise<string | null> {
			const token = await candidateAuthService.mintUserIdToken(uid).catch(() => null)
			if (!token) return null
			const result = await coreClient.issueInterviewHandoff(token).catch(() => null)
			return result?.ok ? result.data.code : null
		},

		/**
		 * Entrevistas do candidato, vindas de `GET /interviews/mine`.
		 *
		 * Antes este método lia `infra.candidateRepository` direto, duplicando
		 * regra que já vive no core: não separava a entrevista de perfil das de
		 * empresa, e não trazia progresso nem feedback. Agora o canal MCP só
		 * traduz — como faz com todo o resto.
		 *
		 * O link de cada entrevista aberta ganha handoff no MESMO ticket: ele
		 * autentica a sessão, não uma vaga, então um só serve pra lista inteira.
		 */
		async listMyInterviews(uid: string): Promise<MyInterviewsResult> {
			const token = await candidateAuthService.mintUserIdToken(uid)
			const result = await coreClient.getMyInterviews(token)
			if (!result.ok) {
				return { profileInterview: null, companyInterviews: [], total: 0 }
			}

			const { profileInterview, companyInterviews } = result.data
			const hasOpenLink =
				(profileInterview && profileInterview.status !== 'completed') ||
				companyInterviews.some((item) => item.status !== 'completed')

			const handoff = hasOpenLink
				? await coreClient
						.issueInterviewHandoff(token)
						.then((r) => (r.ok ? r.data.code : null))
						.catch(() => null)
				: null

			const withHandoff = (item: coreClient.CandidateInterviewSummary) => {
				if (!handoff || !item.interviewUrl || item.status === 'completed') return item
				const separator = item.interviewUrl.includes('?') ? '&' : '?'
				return {
					...item,
					interviewUrl: `${item.interviewUrl}${separator}handoff=${encodeURIComponent(handoff)}`,
				}
			}

			return {
				profileInterview: profileInterview ? withHandoff(profileInterview) : null,
				companyInterviews: companyInterviews.map(withHandoff),
				total: (profileInterview ? 1 : 0) + companyInterviews.length,
			}
		},

		/**
		 * O que as entrevistas dele mostram sobre como ele se comunica.
		 *
		 * O core garante o contrato: nota, aprovação e aderência à vaga não saem
		 * de lá. Aqui é só repasse — e no chat isso vale mais que na tela, porque
		 * o assistente consegue explicar e treinar em cima do que veio.
		 */
		async getInsights(uid: string): Promise<coreClient.CandidateInsights | null> {
			const token = await candidateAuthService.mintUserIdToken(uid)
			const result = await coreClient.getMyInsights(token)
			return result.ok ? result.data : null
		},
	}
}

export type CandidateInterviewsService = ReturnType<typeof createCandidateInterviewsService>
