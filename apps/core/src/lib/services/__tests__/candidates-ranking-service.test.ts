import {
	getDateRangeFilter,
	processCandidatesMap,
	createCandidatesRankingService,
} from '../candidates-ranking-service'
import { createMockInfra } from './mock-infra'

// ─── getDateRangeFilter ───────────────────────────────────────────────────────

describe('getDateRangeFilter', () => {
	it('returns epoch (0) for unknown/ALL range', () => {
		const date = getDateRangeFilter('all')
		expect(date.getTime()).toBe(new Date(0).getTime())
	})

	it('returns a date ~7 days ago for LAST_WEEK', () => {
		const before = Date.now()
		const date = getDateRangeFilter('lastWeek') // DataRange.LAST_WEEK = 'lastWeek'
		const after = Date.now()
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
		expect(date.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000)
		expect(date.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 1000)
	})

	it('returns a date ~1 month ago for LAST_MONTH', () => {
		const result = getDateRangeFilter('lastMonth') // DataRange.LAST_MONTH = 'lastMonth'
		const monthAgo = new Date()
		monthAgo.setMonth(monthAgo.getMonth() - 1)
		expect(Math.abs(result.getTime() - monthAgo.getTime())).toBeLessThan(1000)
	})
})

// ─── processCandidatesMap ─────────────────────────────────────────────────────

describe('processCandidatesMap', () => {
	const makeCandidate = (overrides = {}) => ({
		name: 'João',
		email: 'j@j.com',
		photo_url: '',
		interviews: 2,
		averageScore: 7.5,
		lastInterview: new Date('2024-06-01'),
		status: 'approved',
		userId: 'u1',
		validInterviewsCount: 2,
		...overrides,
	})

	const baseFilters = {
		status: 'all',
		dataRange: 'all',
		interviewCount: 'all',
		dateLimit: new Date(0),
	}

	it('returns all candidates when filters are all', () => {
		const map = new Map([
			['key1', makeCandidate()],
			['key2', makeCandidate({ email: 'b@b.com', averageScore: 5 })],
		])
		const result = processCandidatesMap(map, baseFilters as never)
		expect(result).toHaveLength(2)
	})

	it('sorts by averageScore descending', () => {
		const map = new Map([
			['a', makeCandidate({ averageScore: 3 })],
			['b', makeCandidate({ averageScore: 9 })],
			['c', makeCandidate({ averageScore: 6 })],
		])
		const result = processCandidatesMap(map, baseFilters as never)
		expect(result[0].averageScore).toBe(9)
		expect(result[1].averageScore).toBe(6)
		expect(result[2].averageScore).toBe(3)
	})

	it('filters by status when not "all"', () => {
		const map = new Map([
			['a', makeCandidate({ status: 'approved' })],
			['b', makeCandidate({ status: 'rejected' })],
		])
		const result = processCandidatesMap(map, { ...baseFilters, status: 'approved' } as never)
		expect(result).toHaveLength(1)
		expect(result[0].status).toBe('approved')
	})

	it('filters by dateLimit when dataRange is not all', () => {
		const recent = new Date('2024-06-01')
		const old = new Date('2020-01-01')
		const cutoff = new Date('2023-01-01')

		const map = new Map([
			['a', makeCandidate({ lastInterview: recent })],
			['b', makeCandidate({ lastInterview: old })],
		])
		const result = processCandidatesMap(map, {
			...baseFilters,
			dataRange: 'last_month',
			dateLimit: cutoff,
		} as never)
		expect(result).toHaveLength(1)
		expect(result[0].lastInterview).toEqual(recent)
	})

	it('filters by score range', () => {
		const map = new Map([
			['a', makeCandidate({ averageScore: 7.5 })],
			['b', makeCandidate({ averageScore: 8.9 })],
		])
		const result = processCandidatesMap(map, { ...baseFilters, score: 7 } as never)
		// score filter: floor(7) = 7, max = 7.99 → only 7.5 matches
		expect(result).toHaveLength(1)
		expect(result[0].averageScore).toBe(7.5)
	})

	it('filters by find text', () => {
		const map = new Map([
			['a', makeCandidate({ name: 'João Silva', email: 'joao@x.com' })],
			['b', makeCandidate({ name: 'Maria Santos', email: 'maria@x.com' })],
		])
		const result = processCandidatesMap(map, { ...baseFilters, find: 'joão' } as never)
		expect(result).toHaveLength(1)
		expect(result[0].name).toBe('João Silva')
	})

	it('returns empty array for empty map', () => {
		expect(processCandidatesMap(new Map(), baseFilters as never)).toEqual([])
	})
})

// ─── createCandidatesRankingService ──────────────────────────────────────────

describe('createCandidatesRankingService', () => {
	const COMPANY_ID = 'company-rank'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createCandidatesRankingService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createCandidatesRankingService(infra)
	})

	describe('enrichCandidatesWithJobs', () => {
		it('returns candidates with empty jobsApplied when no userId and no email', async () => {
			const candidates = [{ name: 'X', email: null, userId: null }]
			const result = await service.enrichCandidatesWithJobs(candidates as never, COMPANY_ID)
			expect(result[0].jobsApplied).toEqual([])
			expect(infra.candidateRepository.listCompanyInterviews).not.toHaveBeenCalled()
		})

		it('builds jobsApplied from company interviews grouped by email', async () => {
			const companyInterviews = [
				{
					id: 'interview-1',
					email: 'x@x.com',
					name: 'X',
					finished: true,
					score: '7.1',
					date: new Date('2024-05-01T10:00:00.000Z').toISOString(),
					jobName: 'Backend',
					typeInterview: 'interview',
					candidateStatus: 'approved',
					job_ref: { id: 'job-1' },
					job_applied_ref: { id: 'ja1', path: 'users/u1/jobsApplied/ja1' },
				},
				{
					id: 'interview-2',
					email: 'x@x.com',
					name: 'X',
					finished: true,
					score: '6.5',
					date: new Date('2024-04-01T10:00:00.000Z').toISOString(),
					jobName: 'Frontend',
					typeInterview: 'interview',
					candidateStatus: 'pending',
					job_ref: { id: 'job-2' },
					job_applied_ref: { id: 'ja2', path: 'users/u2/jobsApplied/ja2' },
				},
				{
					id: 'interview-3',
					email: 'x@x.com',
					name: 'Outro Nome',
					finished: true,
					score: '9.9',
					date: new Date('2024-03-01T10:00:00.000Z').toISOString(),
					jobName: 'Should not merge',
					typeInterview: 'interview',
					candidateStatus: 'approved',
					job_ref: { id: 'job-3' },
					job_applied_ref: { id: 'ja3', path: 'users/u3/jobsApplied/ja3' },
				},
				{
					id: 'interview-4',
					email: 'x@x.com',
					name: 'X',
					finished: false,
					score: '8.0',
					date: new Date('2024-02-01T10:00:00.000Z').toISOString(),
					jobName: 'Ignore unfinished',
					typeInterview: 'interview',
					candidateStatus: 'approved',
					job_ref: { id: 'job-4' },
					job_applied_ref: { id: 'ja4', path: 'users/u4/jobsApplied/ja4' },
				},
			]
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(companyInterviews as never)
			infra.userRepository.getUser.mockResolvedValue({ phone_number: '+5511' } as never)

			const candidates = [{ name: 'X', email: 'x@x.com', userId: 'u1' }]
			const result = await service.enrichCandidatesWithJobs(candidates as never, COMPANY_ID)

			expect(result[0].jobsApplied).toHaveLength(2)
			expect((result[0].jobsApplied as any[])[0].id).toBe('ja1')
			expect((result[0].jobsApplied as any[])[1].id).toBe('ja2')
			expect((result[0].jobsApplied as any[])[0].interview.score).toBe('7.1')
		})

		it('returns empty jobsApplied and does not throw on error', async () => {
			infra.candidateRepository.listCompanyInterviews.mockRejectedValue(new Error('db error'))
			const candidates = [{ name: 'X', email: 'x@x.com', userId: 'u1' }]
			const result = await service.enrichCandidatesWithJobs(candidates as never, COMPANY_ID)
			expect(result[0].jobsApplied).toEqual([])
		})
	})
})
