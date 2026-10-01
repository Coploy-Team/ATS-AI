import type { JobApplied, PostJob, ScreeningKnockoutTree } from '@coploy/domain'

import {
	createScreeningKnockoutService,
	evaluateScreeningKnockout,
} from '../screening-knockout-service'
import { createMockInfra } from './mock-infra'

const COMPANY_ID = 'company-1'
const JOB_ID = 'job-1'
const JOB_APPLIED_ID = 'application-1'
const USER_ID = 'user-1'

function makeTree(overrides: Partial<ScreeningKnockoutTree> = {}): ScreeningKnockoutTree {
	return {
		version: 1,
		nodes: [
			{
				id: 'age',
				question: 'Tem 18 anos ou mais?',
				type: 'boolean',
				rule: { operator: 'equals', value: true },
				onFail: 'knockout',
				weight: 2,
			},
			{
				id: 'experience',
				question: 'Anos de experiência',
				type: 'number',
				rule: { operator: 'greater_than_or_equal', value: 3 },
				onFail: 'knockout',
				weight: 3,
			},
			{
				id: 'location',
				question: 'Localidade',
				type: 'single-choice',
				options: ['SP', 'RJ'],
				rule: { operator: 'in', value: ['SP', 'RJ'] },
				onFail: 'flag',
				weight: 1,
			},
		],
		...overrides,
	}
}

function makeJob(overrides: Partial<PostJob> = {}): PostJob {
	return {
		id: JOB_ID,
		jobName: 'Pessoa Desenvolvedora',
		knockoutTree: makeTree(),
		...overrides,
	}
}

function makeJobApplied(overrides: Partial<JobApplied> = {}): JobApplied {
	return {
		id: JOB_APPLIED_ID,
		companyOwner: { id: COMPANY_ID },
		jobApplied: { id: JOB_ID },
		userApplied: { id: USER_ID },
		candidateStatus: 'Pending',
		...overrides,
	}
}

describe('evaluateScreeningKnockout', () => {
	it('passes when every rule is satisfied', () => {
		expect(evaluateScreeningKnockout(makeTree(), {
			age: true,
			experience: 5,
			location: 'SP',
		})).toEqual({
			passed: true,
			score: 100,
			failedNodeIds: [],
			rejectionReasonCode: null,
		})
	})

	it('fails deterministically by knockout node', () => {
		expect(evaluateScreeningKnockout(makeTree(), {
			age: false,
			experience: 5,
			location: 'SP',
		})).toEqual({
			passed: false,
			score: 66.67,
			failedNodeIds: ['age'],
			rejectionReasonCode: 'nao_atende_requisitos',
		})
	})

	it('records multiple failed nodes', () => {
		expect(evaluateScreeningKnockout(makeTree(), {
			age: false,
			experience: 1,
			location: 'MG',
		})).toEqual({
			passed: false,
			score: 0,
			failedNodeIds: ['age', 'experience', 'location'],
			rejectionReasonCode: 'nao_atende_requisitos',
		})
	})

	it('passes with flags only and keeps failed node ids', () => {
		const result = evaluateScreeningKnockout(makeTree(), {
			age: true,
			experience: 3,
			location: 'MG',
		})

		expect(result).toEqual({
			passed: true,
			score: 83.33,
			failedNodeIds: ['location'],
			rejectionReasonCode: null,
		})
	})

	it.each([
		['empty tree', { version: 1, nodes: [] } as ScreeningKnockoutTree],
		['missing tree', null],
	])('is a no-op for %s', (_caseName, tree) => {
		expect(evaluateScreeningKnockout(tree, {})).toEqual({
			passed: true,
			score: 0,
			failedNodeIds: [],
			rejectionReasonCode: null,
		})
	})

	it('treats missing answers as failed rules', () => {
		expect(evaluateScreeningKnockout(makeTree(), {
			age: true,
		})).toEqual({
			passed: false,
			score: 33.33,
			failedNodeIds: ['experience', 'location'],
			rejectionReasonCode: 'nao_atende_requisitos',
		})
	})
})

describe('screening-knockout-service submit', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
	})

	afterEach(() => {
		jest.useRealTimers()
		jest.restoreAllMocks()
	})

	it('does not persist anything when the job has no knockoutTree', async () => {
		const infra = createMockInfra()
		infra.jobRepository.getJob.mockResolvedValue(makeJob({ knockoutTree: null }))
		infra.candidateRepository.getJobApplied.mockResolvedValue(makeJobApplied())

		const result = await createScreeningKnockoutService(infra).submit({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			jobAppliedId: JOB_APPLIED_ID,
			candidateUserId: USER_ID,
			answers: {},
		})

		expect(result).toMatchObject({
			passed: true,
			action: 'continue_interview',
			score: 0,
			failedNodeIds: [],
		})
		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
	})

	it('persists the result and lets the candidate continue when passed', async () => {
		const infra = createMockInfra()
		const tree = makeTree()
		infra.jobRepository.getJob.mockResolvedValue(makeJob({ knockoutTree: tree }))
		infra.candidateRepository.getJobApplied.mockResolvedValue(makeJobApplied())

		const result = await createScreeningKnockoutService(infra).submit({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			jobAppliedId: JOB_APPLIED_ID,
			candidateUserId: USER_ID,
			answers: { age: true, experience: 5, location: 'SP' },
		})

		expect(result.action).toBe('continue_interview')
		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			USER_ID,
			JOB_APPLIED_ID,
			expect.objectContaining({
				screeningKnockoutAnswers: { age: true, experience: 5, location: 'SP' },
				screeningKnockoutTreeSnapshot: tree,
				screeningKnockoutResult: expect.objectContaining({
					passed: true,
					score: 100,
					failedNodeIds: [],
					rejectionReasonCode: null,
				}),
			}),
		)
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
	})

	it('rejects the application and writes a screening_knockout event on knockout failure', async () => {
		const infra = createMockInfra()
		infra.jobRepository.getJob.mockResolvedValue(makeJob())
		infra.candidateRepository.getJobApplied.mockResolvedValue(makeJobApplied())
		infra.candidateRepository.getJobInterview.mockResolvedValue(makeJobApplied())
		infra.candidateRepository.getCompanyInterview.mockResolvedValue({
			id: JOB_APPLIED_ID,
			company_id: COMPANY_ID,
			post_job_id: JOB_ID,
		})
		infra.outboxRepository.insert.mockImplementation(async (event) => ({
			...event,
			createdAt: new Date(),
			status: 'pending',
			retryCount: 0,
		}))

		const result = await createScreeningKnockoutService(infra).submit({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			jobAppliedId: JOB_APPLIED_ID,
			candidateUserId: USER_ID,
			answers: { age: false, experience: 1, location: 'SP' },
		})

		expect(result).toMatchObject({
			passed: false,
			action: 'rejected',
			failedNodeIds: ['age', 'experience'],
			rejectionReasonCode: 'nao_atende_requisitos',
			rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			failedRequirementLabel: 'Tem 18 anos ou mais?',
		})
		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			USER_ID,
			JOB_APPLIED_ID,
			expect.objectContaining({
				candidateStatus: 'Rejected',
				candidate_status: 'Rejected',
				rejectionReasonCode: 'nao_atende_requisitos',
				rejectionReasonLabel: 'Não atende aos requisitos',
				rejectionDecisionSource: 'knockout',
				rejectionDecidedByUserId: null,
				rejectionTaxonomyVersion: '2026-08-13',
				rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			}),
		)
		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalled()
		expect(infra.candidateRepository.updateCompanyInterview).toHaveBeenCalled()
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(expect.objectContaining({
			type: 'screening_knockout',
			companyId: COMPANY_ID,
			payload: expect.objectContaining({
				applicationId: JOB_APPLIED_ID,
				jobId: JOB_ID,
				reasonCode: 'nao_atende_requisitos',
				rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
				passed: false,
				failedNodeIds: ['age', 'experience'],
			}),
		}))
		expect(
			(infra.outboxRepository.insert.mock.calls[0][0].payload as { rejectionEvidence: string })
				.rejectionEvidence,
		).toBe(
			(infra.candidateRepository.updateJobApplied.mock.calls[0][2] as { rejectionEvidence: string })
				.rejectionEvidence,
		)
	})

	it('exposes the same human explanation on the candidate mirror endpoint', async () => {
		const infra = createMockInfra()
		const tree = makeTree()
		infra.candidateRepository.getJobApplied.mockResolvedValue(makeJobApplied({
			candidateStatus: 'Rejected',
			rejectionReasonCode: 'nao_atende_requisitos',
			rejectionReasonLabel: 'Não atende aos requisitos',
			rejectionDecisionSource: 'knockout',
			rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			screeningKnockoutResult: {
				treeVersion: 1,
				passed: false,
				score: 66.67,
				failedNodeIds: ['age'],
				rejectionReasonCode: 'nao_atende_requisitos',
				evaluatedAt: new Date('2026-08-13T12:00:00.000Z'),
			},
			screeningKnockoutTreeSnapshot: tree,
		}))

		const mirror = await createScreeningKnockoutService(infra).getCandidateMirror({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			jobAppliedId: JOB_APPLIED_ID,
			candidateUserId: USER_ID,
		})

		expect(mirror).toEqual({
			rejected: true,
			rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			failedRequirementLabel: 'Tem 18 anos ou mais?',
			rejectionDecisionSource: 'knockout',
		})
	})

	it('does not fail the submit when outbox writing fails', async () => {
		const infra = createMockInfra()
		jest.spyOn(console, 'error').mockImplementation(() => undefined)
		infra.jobRepository.getJob.mockResolvedValue(makeJob())
		infra.candidateRepository.getJobApplied.mockResolvedValue(makeJobApplied())
		infra.candidateRepository.getJobInterview.mockResolvedValue(null)
		infra.candidateRepository.getCompanyInterview.mockResolvedValue(null)
		infra.outboxRepository.insert.mockRejectedValue(new Error('outbox unavailable'))

		await expect(createScreeningKnockoutService(infra).submit({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			jobAppliedId: JOB_APPLIED_ID,
			candidateUserId: USER_ID,
			answers: { age: false, experience: 5, location: 'SP' },
		})).resolves.toMatchObject({
			action: 'rejected',
			rejectionReasonCode: 'nao_atende_requisitos',
		})
	})
})
