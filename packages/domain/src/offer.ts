/**
 * Oferta e dados de contratação (V2-402 / V2-403).
 *
 * O funil terminava em "aprovado" e o produto abandonava o processo justamente
 * no momento de maior valor. A contratação acontecia fora da Coploy — e por isso
 * o dado de QUEM FOI CONTRATADO de fato nunca fechava, que é exatamente o que
 * alimenta o quality-of-hire do blueprint (e, depois, o rótulo do ranking).
 */

export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'cancelled'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export interface Offer {
	id: string
	companyId: string
	jobId: string
	candidateId: string
	/** Em centavos, como o resto do dinheiro no sistema. */
	salaryMinor: number
	currency: string
	/** CLT, PJ, estágio… texto livre até existir taxonomia de contrato. */
	contractType?: string | null
	startDate?: Date | string | null
	/** Benefícios e condições em texto — vira corpo do e-mail. */
	notes?: string | null
	status: OfferStatus
	sentAt?: Date | string | null
	respondedAt?: Date | string | null
	/** Por que recusou — o dado que ensina a empresa a ofertar melhor. */
	declineReason?: string | null
	createdByUserId: string
	createdAt: Date | string
	updatedAt?: Date | string | null
}

/**
 * Dados de contratação (V2-403).
 *
 * Preenchidos quando o candidato vira `hired`. Sem isso, `hired` é só um rótulo
 * de coluna e o funil não fecha em nada mensurável.
 */
export interface HiringInfo {
	salaryMinor?: number | null
	currency?: string | null
	contractType?: string | null
	startDate?: Date | string | null
	/** Centro de custo — texto livre até V2-501 (estrutura organizacional). */
	costCenter?: string | null
	notes?: string | null
	recordedByUserId?: string | null
	recordedAt?: Date | string | null
}

/** Oferta só é enviada uma vez; cancelar e refazer é o caminho de correção. */
export function canSendOffer(offer: Pick<Offer, 'status'>): boolean {
	return offer.status === 'draft'
}

export function isOfferOpen(offer: Pick<Offer, 'status'>): boolean {
	return offer.status === 'draft' || offer.status === 'sent'
}
