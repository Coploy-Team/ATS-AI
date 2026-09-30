import type { HiringInfo, Offer } from '@coploy/domain'
import { canSendOffer, isOfferOpen } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { createCandidateTimelineService } from '@/lib/services/candidate-timeline-service'

/**
 * Oferta e contratação (V2-402 / V2-403).
 *
 * O funil terminava em "aprovado": a contratação acontecia fora da Coploy e o
 * dado de quem foi contratado de fato nunca fechava — justamente o dado que
 * alimenta o quality-of-hire e, depois, o rótulo do ranking (V2-902).
 */
export function createOfferService(infra: InfraProvider) {
	const timeline = createCandidateTimelineService(infra)

	return {
		async listOffers(params: { companyId: string; jobId: string; candidateId: string }) {
			const offers = await infra.offerRepository.listOffers(
				params.companyId,
				params.jobId,
				params.candidateId,
			)
			return { offers }
		},

		/**
		 * Cria em RASCUNHO, nunca enviando direto.
		 *
		 * Oferta é a comunicação mais delicada do processo: salário errado num
		 * e-mail já enviado não se desfaz. Rascunho → revisar → enviar é o mesmo
		 * cuidado que o undo dá à reprovação.
		 */
		async createOffer(params: {
			companyId: string
			jobId: string
			candidateId: string
			salaryMinor: number
			currency?: string
			contractType?: string | null
			startDate?: string | null
			notes?: string | null
			createdByUserId: string
		}): Promise<Offer> {
			if (!Number.isFinite(params.salaryMinor) || params.salaryMinor <= 0) {
				throw new BadRequestError('Informe o salário da oferta')
			}

			const existing = await infra.offerRepository.listOffers(
				params.companyId,
				params.jobId,
				params.candidateId,
			)
			// duas ofertas abertas para a mesma pessoa é erro de operação, não caso de uso
			if (existing.some(isOfferOpen)) {
				throw new BadRequestError('Já existe uma oferta aberta para este candidato')
			}

			return infra.offerRepository.createOffer(params.companyId, {
				companyId: params.companyId,
				jobId: params.jobId,
				candidateId: params.candidateId,
				salaryMinor: params.salaryMinor,
				currency: params.currency ?? 'BRL',
				contractType: params.contractType ?? null,
				startDate: params.startDate ? new Date(params.startDate) : null,
				notes: params.notes ?? null,
				status: 'draft',
				createdByUserId: params.createdByUserId,
			} as never)
		},

		async sendOffer(params: { companyId: string; offerId: string; authorId?: string | null }) {
			const offer = await infra.offerRepository.getOffer(params.companyId, params.offerId)
			if (!offer) throw new NotFoundError('Oferta não encontrada')
			if (!canSendOffer(offer)) throw new BadRequestError('Esta oferta já foi enviada')

			const sentAt = new Date()
			await infra.offerRepository.updateOffer(params.companyId, params.offerId, {
				status: 'sent',
				sentAt,
			} as never)

			void timeline.recordEvent({
				companyId: params.companyId,
				jobId: offer.jobId,
				candidateId: offer.candidateId,
				type: 'email_sent',
				body: 'Oferta enviada',
				metadata: { offerId: offer.id, salaryMinor: offer.salaryMinor },
				authorId: params.authorId ?? null,
			})

			return { ...offer, status: 'sent' as const, sentAt }
		},

		/**
		 * Resposta do candidato.
		 *
		 * Recusa exige motivo: é o dado que ensina a empresa a ofertar melhor, e
		 * sem ele "perdemos o candidato" fica sem explicação de novo.
		 */
		async respondOffer(params: {
			companyId: string
			offerId: string
			response: 'accepted' | 'declined'
			declineReason?: string | null
		}) {
			const offer = await infra.offerRepository.getOffer(params.companyId, params.offerId)
			if (!offer) throw new NotFoundError('Oferta não encontrada')
			if (offer.status !== 'sent') throw new BadRequestError('Esta oferta não está aguardando resposta')
			if (params.response === 'declined' && !params.declineReason?.trim()) {
				throw new BadRequestError('Informe o motivo da recusa')
			}

			const respondedAt = new Date()
			await infra.offerRepository.updateOffer(params.companyId, params.offerId, {
				status: params.response,
				respondedAt,
				declineReason: params.declineReason?.trim() ?? null,
			} as never)

			return { ...offer, status: params.response, respondedAt }
		},

		async cancelOffer(params: { companyId: string; offerId: string }) {
			const offer = await infra.offerRepository.getOffer(params.companyId, params.offerId)
			if (!offer) throw new NotFoundError('Oferta não encontrada')
			if (!isOfferOpen(offer)) throw new BadRequestError('Só é possível cancelar oferta aberta')
			await infra.offerRepository.updateOffer(params.companyId, params.offerId, {
				status: 'cancelled',
			} as never)
		},

		/**
		 * Dados de contratação (V2-403).
		 *
		 * Gravados no próprio `JobApplied`: é o registro da pessoa NAQUELE
		 * processo, e é lá que analytics e quality-of-hire vão buscar.
		 */
		async recordHiring(params: {
			companyId: string
			jobId: string
			candidateId: string
			userId: string
			jobAppliedId: string
			hiring: HiringInfo
			recordedByUserId: string
		}) {
			if (params.hiring.salaryMinor != null && params.hiring.salaryMinor <= 0) {
				throw new BadRequestError('Salário inválido')
			}

			const hiringInfo: HiringInfo = {
				...params.hiring,
				recordedByUserId: params.recordedByUserId,
				recordedAt: new Date(),
			}

			await infra.candidateRepository.updateJobApplied(params.userId, params.jobAppliedId, {
				hiringInfo,
			} as never)

			void timeline.recordEvent({
				companyId: params.companyId,
				jobId: params.jobId,
				candidateId: params.candidateId,
				type: 'stage_changed',
				body: 'Contratação registrada',
				metadata: { to: 'hired', startDate: params.hiring.startDate ?? null },
				authorId: params.recordedByUserId,
			})

			return { hiringInfo }
		},
	}
}
