import {
	processInterviewRow,
	processAllInterviews,
	createCandidatesRankingService,
} from '../candidates-ranking-service'
import {
	processInterviewRow as excelProcessRow,
	processAllInterviews as excelProcessAll,
	createExcelReportService,
} from '../excel-report-service'
import { createMockInfra } from './mock-infra'

// ─── processInterviewRow ──────────────────────────────────────────────────────

describe('processInterviewRow', () => {
	const makeInterview = (overrides = {}) => ({
		id: 'i-1',
		identifier: 'JOB-001',
		name: 'Ana Lima',
		email: 'ana@x.com',
		phone_number: '+5511',
		score: 8.5,
		career_level: 'junior',
		job_name: 'Engenheiro',
		candidate_status: 'approved',
		date: { seconds: 1700000000, nanos: 0 },
		finishedTime: { seconds: 1700003600, nanos: 0 },
		date_select: { seconds: 1700007200, nanos: 0 },
		stopped: false,
		job_ref: { id: 'job-1', path: 'jobs/job-1' },
		user_ref: { id: 'user-1' },
		...overrides,
	})

	it('maps basic fields correctly', () => {
		const result = excelProcessRow(makeInterview() as never, 0)
		expect(result.nomeCandidato).toBe('Ana Lima')
		expect(result.emailCandidato).toBe('ana@x.com')
		expect(result.telefoneCandidato).toBe('+5511')
		expect(result.vaga).toBe('Engenheiro')
		expect(result.codigoVaga).toBe('JOB-001')
		expect(result.status).toBe('approved')
	})

	it('formats score to 2 decimal places as a number', () => {
		const result = excelProcessRow(makeInterview({ score: 7.123 }) as never, 0)
		expect(result.nota).toBe(7.12)
	})

	it('keeps zero as a valid numeric score', () => {
		const result = excelProcessRow(makeInterview({ score: 0 }) as never, 0)
		expect(result.nota).toBe(0)
	})

	it('returns empty nota when score is null/undefined', () => {
		const result = excelProcessRow(makeInterview({ score: undefined }) as never, 0)
		expect(result.nota).toBe('')
	})

	it('marks job as INACTIVE when stopped=true', () => {
		const result = excelProcessRow(makeInterview({ stopped: true }) as never, 0)
		expect(result.statusVaga).toBe('Inativa') // JobStatus.INACTIVE = 'Inativa'
	})

	it('marks job as ACTIVE when stopped=false', () => {
		const result = excelProcessRow(makeInterview({ stopped: false }) as never, 0)
		expect(result.statusVaga).toBe('Ativa') // JobStatus.ACTIVE = 'Ativa'
	})

	it('sets dataSelecao to pending message when candidate_status is "Pending"', () => {
		// CandidateStatus.PENDING = 'Pending' (capital P)
		const result = excelProcessRow(makeInterview({ candidate_status: 'Pending' }) as never, 0)
		expect(typeof result.dataSelecao).toBe('string')
	})

	it('converts timestamps to Date objects', () => {
		const result = excelProcessRow(makeInterview() as never, 0)
		expect(result.dataRequisicao).toBeInstanceOf(Date)
		expect(result.dataTeste).toBeInstanceOf(Date)
	})
})

// ─── processAllInterviews ─────────────────────────────────────────────────────

describe('processAllInterviews', () => {
	const makeInterview = (overrides = {}) => ({
		id: 'i-1',
		identifier: 'JOB-001',
		name: 'Ana',
		email: 'a@a.com',
		phone_number: '',
		score: 8,
		career_level: 'senior',
		job_name: 'Dev',
		candidate_status: 'approved',
		date: { seconds: 1700000000, nanos: 0 },
		finishedTime: { seconds: 1700003600, nanos: 0 },
		date_select: null,
		stopped: false,
		job_ref: { id: 'job-1' },
		user_ref: { id: 'u-1' },
		...overrides,
	})

	it('processes all interviews and accumulates scores', () => {
		const interviews = [
			makeInterview({ score: 8 }),
			makeInterview({ id: 'i-2', score: 6 }),
		]
		const { processedInterviews, totalScore, validScoreCount } = excelProcessAll(
			interviews as never,
		)
		expect(processedInterviews).toHaveLength(2)
		expect(totalScore).toBe(14)
		expect(validScoreCount).toBe(2)
	})

	it('skips score accumulation when score is falsy', () => {
		const interviews = [makeInterview({ score: 0 })]
		const { totalScore, validScoreCount } = excelProcessAll(interviews as never)
		expect(totalScore).toBe(0)
		expect(validScoreCount).toBe(0)
	})

	it('returns empty result for empty list', () => {
		const { processedInterviews, totalScore, validScoreCount } = excelProcessAll([])
		expect(processedInterviews).toHaveLength(0)
		expect(totalScore).toBe(0)
		expect(validScoreCount).toBe(0)
	})
})

// ─── createExcelReportService ─────────────────────────────────────────────────

describe('createExcelReportService', () => {
	const COMPANY_ID = 'comp-excel'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createExcelReportService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createExcelReportService(infra)
	})

	describe('fetchCompanyData', () => {
		it('returns company when found', async () => {
			const mockCompany = { id: COMPANY_ID, companyName: 'Empresa X' }
			infra.companyRepository.getCompany.mockResolvedValue(mockCompany as never)
			const result = await service.fetchCompanyData(COMPANY_ID)
			expect(result.companyName).toBe('Empresa X')
		})

		it('throws when company not found', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(null)
			await expect(service.fetchCompanyData(COMPANY_ID)).rejects.toThrow()
		})
	})

	describe('fetchCompanyInterviews', () => {
		it('returns interviews filtered by finished=true', async () => {
			const interviews = [{ id: 'i-1', finished: true }]
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)

			const result = await service.fetchCompanyInterviews(COMPANY_ID)

			expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					filters: expect.arrayContaining([
						expect.objectContaining({ field: 'finished', value: true }),
					]),
				}),
			)
			expect(result).toHaveLength(1)
		})

		it('returns empty array when no interviews found', async () => {
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([])
			const result = await service.fetchCompanyInterviews(COMPANY_ID)
			expect(result).toEqual([])
		})

		it('applies candidate screen filters before generating the report', async () => {
			const interviews = [
				{
					id: 'i-1',
					name: 'Ana Lima',
					email: 'ana@example.com',
					score: 8.2,
					candidate_status: 'Approved',
					date: new Date('2026-02-10T00:00:00.000Z'),
					job_ref: { id: 'job-1' },
					job_applied_ref: { id: 'applied-1' },
				},
				{
					id: 'i-2',
					name: 'Bruno Alves',
					email: 'bruno@example.com',
					score: 8.4,
					candidate_status: 'Pending',
					date: new Date('2026-02-10T00:00:00.000Z'),
					job_ref: { id: 'job-1' },
					job_applied_ref: { id: 'applied-2' },
				},
			]
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)

			const result = await service.fetchCompanyInterviews(COMPANY_ID, {
				filters: { status: 'Approved', score: 8, find: 'ana', jobId: 'job-1' },
			})

			expect(result).toHaveLength(1)
			expect(result[0].id).toBe('i-1')
		})

		it('filters by candidate interview count', async () => {
			const interviews = [
				{ id: 'i-1', name: 'Ana', email: 'ana@example.com', job_ref: { id: 'job-1' } },
				{ id: 'i-2', name: 'Ana', email: 'ana@example.com', job_ref: { id: 'job-2' } },
				{ id: 'i-3', name: 'Bruno', email: 'bruno@example.com', job_ref: { id: 'job-1' } },
			]
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)

			const result = await service.fetchCompanyInterviews(COMPANY_ID, {
				filters: { interviewCount: 'moreThanOne' },
			})

			expect(result.map((interview) => interview.id)).toEqual(['i-1', 'i-2'])
		})
	})
})
