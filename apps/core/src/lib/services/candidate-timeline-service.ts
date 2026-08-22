import type { CandidateTimelineEntry, TimelineEventType } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

/**
 * Linha do tempo do candidato (V2-303).
 *
 * Junta o que o sistema fez com o que as pessoas disseram. Separar as duas
 * coisas em telas diferentes seria mais fácil de implementar e pior de ler:
 * "reprovado" sem o comentário de quem reprovou é metade da história, e o
 * comentário sem o evento perde a âncora no tempo.
 *
 * ⚠️ Nada daqui é visível ao candidato — é registro interno. A superfície do
 * candidato tem contrato próprio (`candidate-insights-service`), com régua de
 * "veredito é do recrutador, ofício é do candidato".
 */
export function createCandidateTimelineService(infra: InfraProvider) {
	return {
		async listTimeline(params: { companyId: string; jobId: string; candidateId: string }) {
			const entries = await infra.candidateTimelineRepository.listTimeline(
				params.companyId,
				params.jobId,
				params.candidateId,
			)
			return { entries }
		},

		async addComment(params: {
			companyId: string
			jobId: string
			candidateId: string
			authorId: string
			authorName?: string | null
			body: string
		}): Promise<CandidateTimelineEntry> {
			const body = params.body.trim()
			if (!body) throw new BadRequestError('Comentário vazio')

			return infra.candidateTimelineRepository.appendEntry(params.companyId, {
				companyId: params.companyId,
				jobId: params.jobId,
				candidateId: params.candidateId,
				type: 'comment',
				authorId: params.authorId,
				authorName: params.authorName ?? null,
				body,
			} as never)
		},

		/**
		 * Evento de sistema.
		 *
		 * Nunca falha o fluxo que o chamou: registrar histórico é importante, mas
		 * não é mais importante do que mover o candidato. Erro vira log.
		 */
		async recordEvent(params: {
			companyId: string
			jobId: string
			candidateId: string
			type: Exclude<TimelineEventType, 'comment'>
			body?: string | null
			metadata?: Record<string, unknown> | null
			authorId?: string | null
			authorName?: string | null
		}): Promise<void> {
			try {
				await infra.candidateTimelineRepository.appendEntry(params.companyId, {
					companyId: params.companyId,
					jobId: params.jobId,
					candidateId: params.candidateId,
					type: params.type,
					authorId: params.authorId ?? null,
					authorName: params.authorName ?? null,
					body: params.body ?? null,
					metadata: params.metadata ?? null,
				} as never)
			} catch (error) {
				console.error('[CandidateTimeline] falha ao registrar evento:', error)
			}
		},

		/** Só o autor edita, e só comentário — evento de sistema é imutável. */
		async editComment(params: {
			companyId: string
			jobId: string
			candidateId: string
			entryId: string
			authorId: string
			body: string
		}) {
			const entries = await infra.candidateTimelineRepository.listTimeline(
				params.companyId,
				params.jobId,
				params.candidateId,
			)
			const entry = entries.find((item) => item.id === params.entryId)
			if (!entry) throw new NotFoundError('Comentário não encontrado')
			if (entry.type !== 'comment') throw new BadRequestError('Evento de sistema não é editável')
			if (entry.authorId !== params.authorId) {
				throw new BadRequestError('Só o autor pode editar o próprio comentário')
			}

			const body = params.body.trim()
			if (!body) throw new BadRequestError('Comentário vazio')
			await infra.candidateTimelineRepository.updateEntry(params.companyId, params.entryId, body)
		},
	}
}
