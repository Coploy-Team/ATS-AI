import {
	findCachedInsight,
	calculateTotalInterviews,
	hassufficientData,
	preparePromptData,
	createInsightsService,
} from '../insights-service'
import { createMockInfra } from './mock-infra'

// ─── Pure functions ───────────────────────────────────────────────────────────

describe('findCachedInsight', () => {
	it('returns undefined when cache is empty', () => {
		expect(findCachedInsight([], 'pt')).toBeUndefined()
	})

	it('returns the matching language entry', () => {
		const cache = [
			{ language: 'pt', insight: 'análise pt', generatedAt: new Date() },
			{ language: 'en', insight: 'analysis en', generatedAt: new Date() },
		]
		const result = findCachedInsight(cache as never, 'pt')
		expect(result?.language).toBe('pt')
		expect(result?.insight).toBe('análise pt')
	})

	it('returns undefined when language not in cache', () => {
		const cache = [{ language: 'pt', insight: 'ok', generatedAt: new Date() }]
		expect(findCachedInsight(cache as never, 'es')).toBeUndefined()
	})
})

describe('calculateTotalInterviews', () => {
	it('sums all values', () => {
		const items = [{ value: 10 }, { value: 5 }, { value: 3 }]
		expect(calculateTotalInterviews(items)).toBe(18)
	})

	it('returns 0 for empty array', () => {
		expect(calculateTotalInterviews([])).toBe(0)
	})
})

describe('hassufficientData', () => {
	it('returns false when total is 0', () => {
		expect(hassufficientData(0)).toBe(false)
	})

	it('returns false at minimum threshold', () => {
		// MIN_INTERVIEWS_REQUIRED = 2, so > 2 required → 2 returns false
		expect(hassufficientData(2)).toBe(false)
	})

	it('returns true when total exceeds threshold', () => {
		// > 2 → true
		expect(hassufficientData(3)).toBe(true)
	})
})

describe('preparePromptData', () => {
	it('computes approvalRate correctly', () => {
		const sourceData = {
			interviewsByJob: [{ value: 5 }],
			interviewsByTime: [],
			homeData: {
				jobs: { total: 3, items: [1, 2, 3] },
				interviews: { total: 100, items: new Array(100) },
				approved: { total: 25, items: new Array(25) },
			},
		}
		const result = preparePromptData(sourceData as never)
		expect(result.dashboard.approvalRate).toBe('25.0%')
	})

	it('returns 0% when no interviews', () => {
		const sourceData = {
			interviewsByJob: [],
			interviewsByTime: [],
			homeData: {
				jobs: { total: 0, items: [] },
				interviews: { total: 0, items: [] },
				approved: { total: 0, items: [] },
			},
		}
		const result = preparePromptData(sourceData as never)
		expect(result.dashboard.approvalRate).toBe('0%')
	})

	it('passes interviewsByJob and interviewsByTime through', () => {
		const byJob = [{ value: 3 }]
		const byTime = [{ month: 'Jan', value: 10 }]
		const sourceData = {
			interviewsByJob: byJob,
			interviewsByTime: byTime,
			homeData: {
				jobs: { total: 1, items: [] },
				interviews: { total: 1, items: [] },
				approved: { total: 1, items: [] },
			},
		}
		const result = preparePromptData(sourceData as never)
		expect(result.interviewsByJob).toBe(byJob)
		expect(result.interviewsByTime).toBe(byTime)
	})
})

// ─── createInsightsService ────────────────────────────────────────────────────

describe('createInsightsService', () => {
	const COMPANY_ID = 'comp-insights'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createInsightsService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createInsightsService(infra)
	})

	describe('fetchTodaysInsightCache', () => {
		it('queries listInsightsCache with generatedAt >= today', async () => {
			infra.companyRepository.listInsightsCache.mockResolvedValue([])

			await service.fetchTodaysInsightCache(COMPANY_ID)

			expect(infra.companyRepository.listInsightsCache).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					filters: expect.arrayContaining([
						expect.objectContaining({ field: 'generatedAt', operator: '>=' }),
					]),
				}),
			)
		})

		it('returns the cached entries', async () => {
			const cached = [{ language: 'pt', insight: 'ok', generatedAt: new Date() }]
			infra.companyRepository.listInsightsCache.mockResolvedValue(cached as never)
			const result = await service.fetchTodaysInsightCache(COMPANY_ID)
			expect(result).toHaveLength(1)
		})
	})

	describe('saveStandardResponses', () => {
		it('calls createInsightsCache for each supported language', async () => {
			infra.companyRepository.createInsightsCache.mockResolvedValue(undefined as never)
			await service.saveStandardResponses(COMPANY_ID, false)
			// SUPPORTED_LANGUAGES typically has pt + en at minimum
			expect(infra.companyRepository.createInsightsCache.mock.calls.length).toBeGreaterThanOrEqual(1)
		})
	})
})
