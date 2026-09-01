import type { InfraProvider } from '@coploy/infra'
import type { JobApplied } from '@coploy/domain'

import { env } from '@/env'
import { resolveCandidateFacingRejectionExplanation } from './candidate-rejection-mirror'
import { createProfileInterviewService } from './profile-interview-service'

/**
 * Entrevistas do candidato, do ponto de vista dele.
 *
 * Duas naturezas diferentes que a tela precisa separar:
 *
 * - **Entrevista de perfil**: a que ele mesmo criou, sobre a própria carreira.
 *   Não há empresa contratando do outro lado — a vaga é um espelho técnico
 *   (`profileInterview: true`) e o resultado é o que o expõe para o hunting.
 * - **Entrevistas em empresas**: as que ele gravou a convite de uma vaga real.
 *
 * Misturar as duas fazia a tela dizer "candidatura" para algo que é o perfil
 * dele — o vocabulário errado do produto.
 *
 * NÃO expõe a nota. A avaliação de uma entrevista é do recrutador que a pediu,
 * e o candidato receber um número solto — sem o contexto da vaga, do que foi
 * avaliado e de como aquilo pesa — informa mal e desmotiva. Por isso o campo
 * nem sai daqui: omitir na tela deixaria o número visível na resposta.
 */

const MAX_INTERVIEWS = 50

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
	/**
	 * O que foi observado nesta entrevista — só o que descreve o candidato.
	 * Vazio enquanto a avaliação não foi processada.
	 */
	feedback: {
		strengths: string[]
		development: string[]
		suggestions: string[]
	}
	/**
	 * Explicação humana segura da reprovação (TOS-027/028). Null quando não
	 * reprovado ou quando a política de visibilidade esconde o motivo.
	 * Nunca traz score, IDs internos ou nota do recrutador.
	 */
	rejectionExplanation: string | null
	/** Label do requisito knockout falho — pra copy i18n no cliente. */
	failedRequirementLabel: string | null
}

export interface CandidateInterviewsResult {
	profileInterview: CandidateInterviewSummary | null
	companyInterviews: CandidateInterviewSummary[]
}

function buildInterviewUrl(jobId: string, companyId: string): string {
	return `${env.INTERVIEW_BASE_URL}/job/${jobId}/company/${companyId}/login`
}

function toIso(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
	}
	const timestamp = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
	if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString()
	const seconds = timestamp._seconds ?? timestamp.seconds
	return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

const MAX_FEEDBACK_ITEMS = 3

function dedupe(items: string[]): string[] {
	const seen = new Set<string>()
	return items.filter((item) => {
		const key = item.trim().toLowerCase()
		if (!key || seen.has(key)) return false
		seen.add(key)
		return true
	})
}

/**
 * Feedback de uma entrevista: o que foi observado nas respostas dele.
 *
 * A fonte principal é `interview.info[]` — a análise pergunta a pergunta, que
 * existe na maioria das entrevistas e fala do que ele *respondeu*
 * ("Propõe distribuição equilibrada e coerente com o contexto B2B",
 * "Detalhar métricas de suporte para justificar a alocação"). `avaliacaoFinal`
 * é mais rica, mas só existe em parte das entrevistas: usar só ela deixava a
 * maioria dos cards sem nada.
 *
 * `generalImprovement` continua fora, e agora com evidência: no dado real ele
 * diz coisas como "competências críticas para o nível Pleno" e "carece de
 * profundidade" — é a avaliação contra a vaga, não conselho.
 */
// Exportado: o attestation OTS 0.2 (`ots-attestation-service`) usa o MESMO
// feedback que o candidato vê aqui — o documento que ele assina não pode
// contar uma história diferente da tela dele.
export function buildFeedback(jobApplied: JobApplied): CandidateInterviewSummary['feedback'] {
	const evaluation = jobApplied.avaliacaoFinal
	const competencies = [
		...(evaluation?.competencias_criticas ?? []),
		...(evaluation?.competencias_adicionais ?? []),
	]
	const questions = (jobApplied.interview?.info ?? []) as Array<{
		strengths?: string[] | null
		improvement?: string[] | null
	}>

	const strengths = dedupe([
		...questions.flatMap((question) => question.strengths ?? []),
		...(jobApplied.interview?.generalStrengths ?? []),
		...competencies.flatMap((item) => item.pontos_fortes ?? []),
	])

	const development = dedupe([
		...questions.flatMap((question) => question.improvement ?? []),
		...competencies.flatMap((item) => item.pontos_desenvolvimento ?? []),
	])

	return {
		strengths: strengths.slice(0, MAX_FEEDBACK_ITEMS),
		development: development.slice(0, MAX_FEEDBACK_ITEMS),
		suggestions: dedupe(evaluation?.recomendacoes?.sugestoes_melhoria ?? []).slice(
			0,
			MAX_FEEDBACK_ITEMS,
		),
	}
}

function countProgress(jobApplied: JobApplied): { answered: number; total: number } {
	const info = (jobApplied.interview?.info ?? []) as Array<{ finished?: boolean }>
	return {
		answered: info.filter((question) => question.finished === true).length,
		total: info.length,
	}
}

function buildRejectionMirror(jobApplied: JobApplied): Pick<
	CandidateInterviewSummary,
	'rejectionExplanation' | 'failedRequirementLabel'
> {
	const mirror = resolveCandidateFacingRejectionExplanation(jobApplied)
	return {
		rejectionExplanation: mirror.explanation,
		failedRequirementLabel: mirror.failedRequirementLabel,
	}
}

export function createCandidateInterviewsService(infra: InfraProvider) {
	const profileInterviewService = createProfileInterviewService(infra)

	return {
		async listMine(userId: string): Promise<CandidateInterviewsResult> {
			// Quem sabe qual é a entrevista de perfil é o profile-interview-service:
			// ele é o dono desse conceito e é a mesma fonte que o chat e o app de
			// entrevista consultam. Procurar por conta própria dentro da lista
			// paginada falhava — a entrevista de perfil pode simplesmente não estar
			// entre as N mais recentes, e aí a pessoa via "nenhuma entrevista
			// ainda" tendo uma pendente.
			const [applied, profileStatus, user] = await Promise.all([
				/*
				 * ORDENADO. Sem `orderBy` o Firestore devolve por ID de documento,
				 * então "as 50 mais recentes" era uma fatia alfabética: um candidato
				 * com 103 entrevistas via 50 arbitrárias, e a de perfil dele (83ª por
				 * ID) simplesmente não estava lá. A ordenação em memória logo abaixo
				 * arrumava a exibição, nunca a AMOSTRA.
				 */
				infra.candidateRepository.listJobsApplied(userId, {
					limitTo: MAX_INTERVIEWS,
					orderByField: 'appliedTime',
					orderDirection: 'desc',
				}),
				profileInterviewService.getStatus(userId).catch(() => null),
				infra.userRepository.getUser(userId).catch(() => null),
			])

			const profileJobId = profileStatus?.hasInterview ? profileStatus.jobId : null
			/*
			 * O `jobAppliedId` vem do status, que o busca pela vaga-espelho. Ler do
			 * ponteiro do usuário não funcionava: aquele campo só é gravado quando o
			 * app de entrevista chama a rota de progresso, e sem ele o caminho
			 * alternativo abaixo nunca podia rodar.
			 */
			const profileJobAppliedId =
				profileStatus?.jobAppliedId ??
				(user as { dreamJobsInterview?: { jobAppliedId?: string } } | null)
					?.dreamJobsInterview?.jobAppliedId ??
				null

			// Uma busca por empresa/vaga distinta, não por entrevista: um candidato
			// com várias entrevistas na mesma empresa não deve multiplicar leituras.
			const companyIds = [
				...new Set(applied.map((item) => item.companyOwner?.id).filter(Boolean)),
			] as string[]
			const companies = new Map(
				await Promise.all(
					companyIds.map(
						async (id) =>
							[id, await infra.companyRepository.getCompany(id).catch(() => null)] as const,
					),
				),
			)

			const jobs = new Map(
				await Promise.all(
					applied
						.filter((item) => item.jobApplied?.id && item.companyOwner?.id)
						.map(
							async (item) =>
								[
									`${item.companyOwner?.id}:${item.jobApplied?.id}`,
									await infra.jobRepository
										.getJob(item.companyOwner?.id as string, item.jobApplied?.id as string)
										.catch(() => null),
								] as const,
						),
				),
			)

			const summaries: Array<{ summary: CandidateInterviewSummary; isProfile: boolean }> =
				applied.map((item) => {
					const jobId = item.jobApplied?.id ?? null
					const companyId = item.companyOwner?.id ?? null
					const job = jobId && companyId ? jobs.get(`${companyId}:${jobId}`) : null
					const company = companyId ? companies.get(companyId) : null
					const progress = countProgress(item)
					const finished = item.finished === true
					const rejectionMirror = buildRejectionMirror(item)

					return {
						isProfile: job?.profileInterview === true || (!!jobId && jobId === profileJobId),
						summary: {
							id: item.id,
							jobId,
							companyId,
							jobName: item.jobName ?? job?.jobName ?? null,
							companyName: company?.companyName ?? null,
							companyLogo: company?.companLogo ?? null,
							startedAt: toIso(item.appliedTime),
							completedAt: toIso(item.finishedTime),
							finished,
							status: finished
								? 'completed'
								: progress.answered > 0
									? 'in_progress'
									: 'pending',
							questionsAnswered: progress.answered,
							questionsTotal: progress.total,
							interviewUrl:
								jobId && companyId ? buildInterviewUrl(jobId, companyId) : '',
							// Só faz sentido em entrevista concluída: antes disso não há
							// avaliação, e mostrar bloco vazio parece defeito.
							feedback: finished
								? buildFeedback(item)
								: { strengths: [], development: [], suggestions: [] },
							...rejectionMirror,
						},
					}
				})

			// Mais recente primeiro: é a que a pessoa veio ver.
			const byRecency = (a: CandidateInterviewSummary, b: CandidateInterviewSummary) =>
				(b.startedAt ?? '').localeCompare(a.startedAt ?? '')

			const profileFromList =
				summaries
					.filter((item) => item.isProfile)
					.map((item) => item.summary)
					.sort(byRecency)[0] ?? null

			/**
			 * A entrevista de perfil existe mesmo quando ficou fora da página de
			 * jobsApplied — quem tem dezenas de entrevistas não a tem entre as mais
			 * recentes. Nesse caso buscamos o documento dela diretamente.
			 *
			 * O jobApplied é o que garante o link: `getStatus` só monta a URL se
			 * `PROFILE_INTERVIEW_COMPANY_ID` estiver configurado, mas a entrevista
			 * carrega o próprio `companyOwner`. Depender da env pra LER produzia um
			 * card sem botão — a pessoa via a entrevista e não tinha como abri-la.
			 */
			let profileInterview = profileFromList
			if (!profileInterview && profileStatus?.hasInterview && profileJobAppliedId) {
				const doc = await infra.candidateRepository
					.getJobApplied(userId, profileJobAppliedId)
					.catch(() => null)
				if (doc) {
					const jobId = doc.jobApplied?.id ?? profileStatus.jobId
					const companyId = doc.companyOwner?.id ?? profileStatus.companyId
					const progress = countProgress(doc)
					const finished = doc.finished === true
					const rejectionMirror = buildRejectionMirror(doc)
					profileInterview = {
						id: doc.id,
						jobId,
						companyId,
						jobName: doc.jobName ?? null,
						companyName: null,
						companyLogo: null,
						startedAt: toIso(doc.appliedTime) ?? profileStatus.createdAt,
						completedAt: toIso(doc.finishedTime) ?? profileStatus.completedAt,
						finished,
						status: finished
							? 'completed'
							: progress.answered > 0
								? 'in_progress'
								: 'pending',
						questionsAnswered: progress.answered,
						questionsTotal: progress.total,
						interviewUrl:
							jobId && companyId
								? buildInterviewUrl(jobId, companyId)
								: (profileStatus.interviewUrl ?? ''),
						feedback: finished
							? buildFeedback(doc)
							: { strengths: [], development: [], suggestions: [] },
						...rejectionMirror,
					}
				}
			}

			return {
				profileInterview,
				companyInterviews: summaries
					.filter((item) => !item.isProfile)
					.map((item) => item.summary)
					.sort(byRecency),
			}
		},
	}
}

export type CandidateInterviewsService = ReturnType<typeof createCandidateInterviewsService>
