import {
	assertKnownFeatureFlagKeys,
	createFeatureFlagsService,
} from '../feature-flags-service'
import { createMockInfra } from './mock-infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

describe('createFeatureFlagsService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let svc: ReturnType<typeof createFeatureFlagsService>

	beforeEach(() => {
		infra = createMockInfra()
		svc = createFeatureFlagsService(infra)
	})

	it('reads flags defaulting missing keys to false', async () => {
		infra.companyRepository.getCompany.mockResolvedValue({
			id: 'co-1',
			companyName: 'Acme',
			featureFlags: { antiGhosting: true },
		})

		const result = await svc.getCompanyFeatureFlags('co-1')
		expect(result).toEqual({
			companyId: 'co-1',
			featureFlags: { antiGhosting: true, applyLite: false },
		})
	})

	it('merges patch without wiping other flags', async () => {
		infra.companyRepository.getCompany.mockResolvedValue({
			id: 'co-1',
			featureFlags: { antiGhosting: true },
		})
		infra.companyRepository.updateCompany.mockResolvedValue(undefined)

		const result = await svc.updateCompanyFeatureFlags('co-1', {
			applyLite: true,
		})

		expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(
			'co-1',
			expect.objectContaining({
				featureFlags: { antiGhosting: true, applyLite: true },
			}),
		)
		expect(result.featureFlags).toEqual({
			antiGhosting: true,
			applyLite: true,
		})
	})

	it('drops unknown persisted keys outside the FeatureFlagKey union on update', async () => {
		infra.companyRepository.getCompany.mockResolvedValue({
			id: 'co-1',
			featureFlags: {
				antiGhosting: true,
				// @ts-expect-error — simulate orphan key stuck from manual write
				legacyUnknown: true,
			},
		})
		infra.companyRepository.updateCompany.mockResolvedValue(undefined)

		await svc.updateCompanyFeatureFlags('co-1', { applyLite: true })

		expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(
			'co-1',
			expect.objectContaining({
				featureFlags: { antiGhosting: true, applyLite: true },
			}),
		)
		const saved = infra.companyRepository.updateCompany.mock.calls[0][1]
		expect(saved.featureFlags).not.toHaveProperty('legacyUnknown')
	})

	it('throws NotFoundError when company is missing', async () => {
		infra.companyRepository.getCompany.mockResolvedValue(null)
		await expect(svc.getCompanyFeatureFlags('missing')).rejects.toBeInstanceOf(
			NotFoundError,
		)
	})
})

describe('assertKnownFeatureFlagKeys', () => {
	it('rejects unknown keys with BadRequestError (admin route maps to 400)', () => {
		expect(() =>
			assertKnownFeatureFlagKeys({ antiGhosting: true, notARealFlag: true }),
		).toThrow(BadRequestError)
		expect(() =>
			assertKnownFeatureFlagKeys({ notARealFlag: false }),
		).toThrow(/Unknown feature flag key: notARealFlag/)
	})

	it('rejects non-boolean values', () => {
		expect(() =>
			assertKnownFeatureFlagKeys({ applyLite: 'yes' }),
		).toThrow(/featureFlags.applyLite must be boolean/)
	})

	it('returns only known boolean flags', () => {
		expect(assertKnownFeatureFlagKeys({ applyLite: true })).toEqual({
			applyLite: true,
		})
	})
})
