import {
	TALENT_CREDITS_CATALOG,
	getTalentCreditsCatalogEntry,
	isKnownTalentFeatureCode,
	listUnpricedTalentCatalogCodes,
	toCatalogSeedItems,
} from '@/http/constants/talent-credits-catalog'

describe('TALENT_CREDITS_CATALOG (TOS-007)', () => {
	it('has exactly C1–C18 with no invented prices (null, never 0 placeholder)', () => {
		expect(TALENT_CREDITS_CATALOG).toHaveLength(18)
		const codes = TALENT_CREDITS_CATALOG.map((c) => c.code)
		expect(codes).toEqual(
			Array.from({ length: 18 }, (_, i) => `C${i + 1}`),
		)

		for (const item of TALENT_CREDITS_CATALOG) {
			expect(item.module).toBeTruthy()
			expect(item.name).toBeTruthy()
			expect(item.description).toBeTruthy()
			// null = indefinido; 0 = grátis — não usar 0 como placeholder
			expect(item.amountCredits).toBeNull()
			expect(item.amountCredits).not.toBe(0)
		}
	})

	it('exposes lookup helpers used by the Credits Service', () => {
		expect(isKnownTalentFeatureCode('C1')).toBe(true)
		expect(isKnownTalentFeatureCode('C18')).toBe(true)
		expect(isKnownTalentFeatureCode('candidate_interview')).toBe(false)
		expect(getTalentCreditsCatalogEntry('C17')?.module).toBe('F2')
		expect(listUnpricedTalentCatalogCodes()).toHaveLength(18)
	})

	it('maps amountCredits → unitCostCredits for seed without inventing 0', () => {
		const seed = toCatalogSeedItems()
		expect(seed).toHaveLength(18)
		expect(seed.every((s) => s.unitCostCredits === null)).toBe(true)
		expect(seed.every((s) => s.active === true)).toBe(true)
	})
})
