import type { InfraProvider } from '@coploy/infra'
import type { Company, StageAction } from '@coploy/domain'
import { normalizeStageId, stageAcceptsActions } from '@coploy/domain'

import { createCandidateTimelineService } from '@/lib/services/candidate-timeline-service'
import { createInterviewInviteService } from '@/lib/services/interview-invite-service'
import { createProfileRequestService } from '@/lib/services/profile-request-service'

/**
 * Dispara o que a etapa configurou quando o candidato entra nela (V2-105).
 *
 * ## Por que fica fora do `bulkUpdateStatus`
 *
 * Mover o candidato é o ato do usuário; o e-mail é consequência. Se o disparo
 * morasse dentro da transação de movimentação, uma falha do provedor de e-mail
 * desfaria uma movimentação que o recrutador já viu acontecer na tela — e ele
 * arrastaria o cartão de novo, gerando um segundo e-mail quando o primeiro
 * voltasse. Aqui roda depois, e falha vira registro, nunca erro.
 *
 * ## Só quem ENTROU
 *
 * Reordenar dentro da mesma coluna, ou mover em lote alguém que já estava na
 * etapa, não dispara nada. A ação é a transição, não o estado — sem isso, um
 * bulk de manutenção mandaria convite para a coluna inteira.
 */
export function createStageActionsRunner(infra: InfraProvider) {
	const timeline = createCandidateTimelineService(infra)

	return {
		async run(params: {
			companyId: string
			jobId: string
			stageId: string
			/** já filtrados: só os que mudaram de etapa e cuja escrita deu certo */
			candidateIds: string[]
			actorId?: string | null
		}) {
			const { companyId, jobId, stageId, candidateIds, actorId } = params
			if (candidateIds.length === 0) return []

			const stage = normalizeStageId(stageId)
			if (!stageAcceptsActions(stage)) return []

			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			const configured = (company?.stageActions?.[stage] ?? []) as StageAction[]
			if (configured.length === 0) return []

			const invites = createInterviewInviteService(infra)
			const profiles = createProfileRequestService(infra)
			const outcomes: Array<{ action: StageAction; ok: boolean; error?: string }> = []

			for (const action of configured) {
				try {
					if (action === 'invite_interview') {
						await invites.inviteToInterview({
							companyId,
							jobId,
							candidateIds,
							invitedByUserId: actorId ?? undefined,
						})
						for (const candidateId of candidateIds) {
							void timeline.recordEvent({
								companyId,
								jobId,
								candidateId,
								type: 'email_sent',
								body: null,
								metadata: { kind: 'interview_invite', trigger: 'stage_action', stage },
								authorId: actorId ?? null,
							})
						}
					}

					if (action === 'request_resume') {
						/*
						 * Um por candidato porque o serviço é por candidato — e a falha de
						 * um não pode calar os outros, que é o que um `Promise.all` faria.
						 */
						for (const candidateId of candidateIds) {
							try {
								await profiles.requestProfile({ companyId, jobId, candidateId })
								void timeline.recordEvent({
									companyId,
									jobId,
									candidateId,
									type: 'profile_requested',
									body: null,
									metadata: { trigger: 'stage_action', stage },
									authorId: actorId ?? null,
								})
							} catch (error) {
								console.error('[StageActions] request_resume falhou', {
									companyId,
									jobId,
									candidateId,
									error: error instanceof Error ? error.message : error,
								})
							}
						}
					}

					outcomes.push({ action, ok: true })
				} catch (error) {
					console.error('[StageActions] ação falhou', {
						companyId,
						jobId,
						stage,
						action,
						error: error instanceof Error ? error.message : error,
					})
					outcomes.push({
						action,
						ok: false,
						error: error instanceof Error ? error.message : 'erro desconhecido',
					})
				}
			}

			return outcomes
		},
	}
}
