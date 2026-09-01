import { createOfferService } from '../offer-service'

function makeInfra(offers: unknown[] = [], offer: unknown = null) {
	return {
		offerRepository: {
			listOffers: jest.fn().mockResolvedValue(offers),
			getOffer: jest.fn().mockResolvedValue(offer),
			createOffer: jest.fn().mockImplementation((_c, data) => ({ id: 'o1', ...data })),
			updateOffer: jest.fn().mockResolvedValue(undefined),
		},
		candidateTimelineRepository: {
			appendEntry: jest.fn().mockResolvedValue({ id: 'e1' }),
			listTimeline: jest.fn().mockResolvedValue([]),
			updateEntry: jest.fn(),
			deleteEntry: jest.fn(),
		},
		candidateRepository: { updateJobApplied: jest.fn().mockResolvedValue(undefined) },
	} as never
}

const base = { companyId: 'c1', jobId: 'j1', candidateId: 'cand1', createdByUserId: 'u1' }

describe('oferta', () => {
	it('nasce em rascunho — salário errado num e-mail enviado não se desfaz', async () => {
		const service = createOfferService(makeInfra())
		const offer = await service.createOffer({ ...base, salaryMinor: 800000 })
		expect(offer.status).toBe('draft')
	})

	it('recusa segunda oferta aberta para o mesmo candidato', async () => {
		const service = createOfferService(makeInfra([{ status: 'sent' }]))
		await expect(service.createOffer({ ...base, salaryMinor: 900000 })).rejects.toThrow(
			/já existe uma oferta aberta/i,
		)
	})

	it('não envia duas vezes a mesma oferta', async () => {
		const service = createOfferService(makeInfra([], { id: 'o1', status: 'sent' }))
		await expect(service.sendOffer({ companyId: 'c1', offerId: 'o1' })).rejects.toThrow(
			/já foi enviada/,
		)
	})

	it('recusa do candidato EXIGE motivo — é o dado que ensina a ofertar melhor', async () => {
		const service = createOfferService(
			makeInfra([], { id: 'o1', status: 'sent', jobId: 'j1', candidateId: 'cand1' }),
		)
		await expect(
			service.respondOffer({ companyId: 'c1', offerId: 'o1', response: 'declined' }),
		).rejects.toThrow(/motivo/)
	})

	it('registra contratação no JobApplied — hired deixa de ser só rótulo', async () => {
		const infra = makeInfra()
		const service = createOfferService(infra)
		await service.recordHiring({
			...base,
			userId: 'user-1',
			jobAppliedId: 'ja-1',
			hiring: { salaryMinor: 800000, startDate: '2026-09-01' },
			recordedByUserId: 'u1',
		})
		const repo = (infra as unknown as { candidateRepository: Record<string, jest.Mock> })
			.candidateRepository
		expect(repo.updateJobApplied).toHaveBeenCalledWith(
			'user-1',
			'ja-1',
			expect.objectContaining({ hiringInfo: expect.objectContaining({ salaryMinor: 800000 }) }),
		)
	})
})
