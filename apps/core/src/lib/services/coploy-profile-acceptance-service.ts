import type { InfraProvider } from '@coploy/infra'
import type { JobApplied, PostJob } from '@coploy/domain'
import { normalizeStageId } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { sharedCoployProfile } from './candidate-public-view-types'
import { createInterviewsService } from './interviews-service'
import { createKanbanService } from './kanban-service'

/**
 * "Aceitar o perfil no lugar da entrevista" (F5, decisões D2 e D3 de 30/09).
 *
 * O candidato compartilhou o perfil Coploy em vez de gravar. Aceitar leva a
 * pessoa para a etapa que vem DEPOIS da entrevista no quadro daquela vaga —
 * Selecionados no quadro padrão, a próxima coluna num quadro próprio — pelo
 * mesmo caminho do quadro (espelhos, histórico, ações por etapa), com o motivo
 * gravado no histórico. Vaga que pede a entrevista (chave desligada) recusa.
 */

export const ACCEPTED_PROFILE_NOTE = 'Entrevista substituída pelo perfil Coploy'
export const ACCEPTED_PROFILE_CODE = 'coploy_profile_accepted'

const INTERVIEW_STAGE = 'pending'
const ACCEPTABLE_FROM = new Set(['applied', 'pending'])

function refId(value: unknown): string | null {
	const path = (value as { path?: string } | undefined)?.path
	if (path) return path.split('/').pop() ?? null
	if (typeof value === 'string') return value
	return (value as { id?: string } | undefined)?.id ?? null
}

/**
 * A etapa depois da entrevista, na ordem do quadro da vaga. Sem a coluna de
 * entrevista (quadro próprio sem ela), a primeira depois de Candidatura. Nunca
 * Reprovado: aceitar não pode cair numa coluna fora do trilho.
 */
export function stageAfterInterview(stages: Array<{ id: string; offTrack?: boolean }>): string | null {
	const onTrack = stages.filter((stage) => !stage.offTrack && stage.id !== 'rejected')
	const anchor = onTrack.findIndex((stage) => stage.id === INTERVIEW_STAGE)
	const from = anchor >= 0 ? anchor : onTrack.findIndex((stage) => stage.id === 'applied')
	return onTrack[from + 1]?.id ?? null
}

export function createCoployProfileAcceptanceService(infra: InfraProvider) {
	const interviews = createInterviewsService(infra)
	const kanban = createKanbanService(infra)

	return {
		async accept(params: {
			companyId: string
			jobId: string
			/** Id do candidato no quadro (doc de `companyInterviews`). */
			candidateId: string
			actorId: string | null
		}) {
			const { companyId, jobId, candidateId } = params
			const interviewDoc = (await infra.candidateRepository
				.getJobInterview(companyId, jobId, candidateId)
				.catch(() => null)) as Record<string, unknown> | null
			if (!interviewDoc) throw new NotFoundError('Candidate not found in this job')

			const userId = refId(interviewDoc.user_ref)
			const jobAppliedId = refId(interviewDoc.job_applied_ref)
			const jobApplied =
				userId && jobAppliedId
					? ((await infra.candidateRepository.getJobApplied(userId, jobAppliedId).catch(() => null)) as JobApplied | null)
					: null
			if (!sharedCoployProfile(jobApplied, interviewDoc)) {
				throw new BadRequestError('Esta candidatura não veio de um perfil Coploy compartilhado')
			}

			const job = (await infra.jobRepository.getJob(companyId, jobId)) as PostJob | null
			if (!job) throw new NotFoundError('Job not found')
			if (job.acceptsCoployProfile === false) {
				throw new BadRequestError('Esta vaga pede a entrevista: peça a entrevista ao candidato')
			}

			const current = normalizeStageId(
				(interviewDoc.candidateStatus ?? interviewDoc.candidate_status) as string | undefined,
			)
			if (!ACCEPTABLE_FROM.has(current)) {
				throw new BadRequestError('O candidato já passou da etapa de entrevista')
			}

			const config = await kanban.getKanbanConfig(companyId, jobId)
			const next = stageAfterInterview(config.stages)
			if (!next) throw new BadRequestError('O quadro desta vaga não tem etapa depois da entrevista')

			// o histórico diz QUEM aceitou; o nome vem do colaborador logado, como no quadro
			const actor = params.actorId
				? ((await Promise.resolve(infra.userRepository.getUsersCompany(params.actorId)).catch(() => null)) as { display_name?: string | null } | null)
				: null
			await interviews.updateInterviewStatus({
				interviewId: candidateId,
				candidateStatus: next,
				postJobId: jobId,
				companyId,
				rejectedByUserId: params.actorId ?? undefined,
				actorName: actor?.display_name ?? null,
				note: ACCEPTED_PROFILE_NOTE,
				noteCode: ACCEPTED_PROFILE_CODE,
			})
			return { candidateId, stage: next }
		},
	}
}
