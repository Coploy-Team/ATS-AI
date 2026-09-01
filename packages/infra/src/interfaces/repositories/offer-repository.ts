import type { CreateInput, Offer, UpdateInput } from '@coploy/domain'

/** Ofertas (V2-402). */
export interface OfferRepository {
	listOffers(companyId: string, jobId: string, candidateId: string): Promise<Offer[]>
	getOffer(companyId: string, id: string): Promise<Offer | null>
	createOffer(companyId: string, data: CreateInput<Offer>): Promise<Offer & { id: string }>
	updateOffer(companyId: string, id: string, data: UpdateInput<Offer>): Promise<void>
}
