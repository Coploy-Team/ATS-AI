import { createCompanyCreditsService } from '../company-credits'
import { createMockInfra } from './mock-infra'

describe('createCompanyCreditsService', () => {
	const COMPANY_ID = 'company-xyz'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createCompanyCreditsService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createCompanyCreditsService(infra)
	})

	describe('getPaidUserIdsForCandidates', () => {
		it('returns empty set for empty pairs', async () => {
			const result = await service.getPaidUserIdsForCandidates(COMPANY_ID, [])
			expect(result.size).toBe(0)
			expect(infra.billingRepository.listCreditsUsed).not.toHaveBeenCalled()
		})

		it('returns empty set when all pairs have null ids', async () => {
			const result = await service.getPaidUserIdsForCandidates(COMPANY_ID, [
				{ id: null, jobApplied: null },
				{ id: 'u1', jobApplied: null },
				{ id: null, jobApplied: 'ja1' },
			])
			expect(result.size).toBe(0)
			expect(infra.billingRepository.listCreditsUsed).not.toHaveBeenCalled()
		})

		it('returns matched pair when billing doc exists', async () => {
			infra.billingRepository.listCreditsUsed.mockResolvedValue([
				{ userId: 'u1', jobApplied: 'ja1', feature: 'candidate_interview' },
			] as never)

			const result = await service.getPaidUserIdsForCandidates(COMPANY_ID, [
				{ id: 'u1', jobApplied: 'ja1' },
			])

			expect(result.size).toBe(1)
			const entries = Array.from(result)
			expect(entries[0]).toEqual({ id: 'u1', jobApplied: 'ja1' })
		})

		it('does not include pair not in billing docs', async () => {
			infra.billingRepository.listCreditsUsed.mockResolvedValue([
				{ userId: 'u1', jobApplied: 'ja-other', feature: 'candidate_interview' },
			] as never)

			const result = await service.getPaidUserIdsForCandidates(COMPANY_ID, [
				{ id: 'u1', jobApplied: 'ja1' },
			])

			expect(result.size).toBe(0)
		})

		it('queries in chunks of 10 when more than 10 unique users', async () => {
			const pairs = Array.from({ length: 25 }, (_, i) => ({
				id: `user-${i}`,
				jobApplied: `ja-${i}`,
			}))

			infra.billingRepository.listCreditsUsed.mockResolvedValue([])

			await service.getPaidUserIdsForCandidates(COMPANY_ID, pairs)

			// 25 unique users → ceil(25/10) = 3 chunks
			expect(infra.billingRepository.listCreditsUsed).toHaveBeenCalledTimes(3)
		})

		it('deduplicates users before chunking', async () => {
			// Same userId, two different jobApplied → counted as 1 unique user
			infra.billingRepository.listCreditsUsed.mockResolvedValue([])

			await service.getPaidUserIdsForCandidates(COMPANY_ID, [
				{ id: 'u1', jobApplied: 'ja1' },
				{ id: 'u1', jobApplied: 'ja2' },
			])

			// Only 1 unique user → 1 chunk
			expect(infra.billingRepository.listCreditsUsed).toHaveBeenCalledTimes(1)
		})

		it('passes correct filters to listCreditsUsed', async () => {
			infra.billingRepository.listCreditsUsed.mockResolvedValue([])

			await service.getPaidUserIdsForCandidates(COMPANY_ID, [
				{ id: 'u1', jobApplied: 'ja1' },
			])

			expect(infra.billingRepository.listCreditsUsed).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					/*
					 * O `feature` saiu da CONSULTA e passou a ser filtrado em memória:
					 * o desbloqueio precisa aceitar duas grafias (`candidate_interview`
					 * da v1 e `view_candidate` que o ATS v2 gravou), e o Firestore
					 * aceita um só `in` por query — que já está em `userId`.
					 */
					filters: [{ field: 'userId', operator: 'in', value: ['u1'] }],
				}),
			)		})
	})
})
