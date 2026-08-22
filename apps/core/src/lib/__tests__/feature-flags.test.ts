import { isFeatureEnabled } from '../feature-flags'

describe('isFeatureEnabled', () => {
	it('returns false when company is null/undefined', () => {
		expect(isFeatureEnabled(null, 'antiGhosting')).toBe(false)
		expect(isFeatureEnabled(undefined, 'applyLite')).toBe(false)
	})

	it('returns false when featureFlags object is absent', () => {
		expect(isFeatureEnabled({}, 'antiGhosting')).toBe(false)
		expect(isFeatureEnabled({ featureFlags: null }, 'antiGhosting')).toBe(false)
		expect(isFeatureEnabled({ featureFlags: undefined }, 'applyLite')).toBe(false)
	})

	it('returns false when key is absent or explicitly false', () => {
		expect(isFeatureEnabled({ featureFlags: {} }, 'antiGhosting')).toBe(false)
		expect(
			isFeatureEnabled({ featureFlags: { antiGhosting: false } }, 'antiGhosting'),
		).toBe(false)
		expect(
			isFeatureEnabled({ featureFlags: { applyLite: true } }, 'antiGhosting'),
		).toBe(false)
	})

	it('returns true only when the flag is explicitly true', () => {
		expect(
			isFeatureEnabled({ featureFlags: { antiGhosting: true } }, 'antiGhosting'),
		).toBe(true)
		expect(
			isFeatureEnabled(
				{ featureFlags: { antiGhosting: true, applyLite: false } },
				'applyLite',
			),
		).toBe(false)
	})

	// Type-level (não runtime): FeatureFlagKey é union fechada —
	// isFeatureEnabled(company, 'notARealFlag') não compila.
})
