import type { JobApplied, PostJob, ScreeningKnockoutTree } from '@coploy/domain'

import { APPLY_LITE_STATUS, createJobApplicationService } from '../job-application-service'
import { createMockInfra } from './mock-infra'

const COMPANY_ID = 'company-1'
const JOB_ID = 'job-1'
const OTHER_JOB_ID = 'job-other'
const USER_ID = 'user-1'
const JOB_APPLIED_ID = 'app-1'
const OTHER_JOB_APPLIED_ID = 'app-other'

function makeTree(): ScreeningKnockoutTree {
	return {
		version: 1,
		nodes: [
			{
				id: 'age',
				question: 'Tem 18 anos ou mais?',
				type: 'boolean',
				rule: { operator: 'equals', value: true },
				onFail: 'knockout',
				weight: 1,
			},
		],
	}
}

function makeJob(overrides: Partial<PostJob> = {}): PostJob {
	return {
		id: JOB_ID,
		jobName: 'Dev',
		typeInterview: 'interview',
		interviewMode: 'video',
		jobQuestions: [{ id: 'q1', question: 'Fale sobre você', skills: 'soft' }],
		additionalQuestions: [],
		stopped: false,
		archived: false,
		...overrides,
	}
}

function makeCreated(overrides: Partial<JobApplied> = {}): JobApplied & { id: string } {
	return {
		id: JOB_APPLIED_ID,
		finished: false,
		candidateStatus: APPLY_LITE_STATUS,
		appliedWithoutInterview: true,
		companyOwner: { id: COMPANY_ID },
		jobApplied: { id: JOB_ID },
		userApplied: { id: USER_ID },
		...overrides,
	}
}

/**
 * Simula o adapter selfhosted: JA_FIELD_MAP só conhece `jobApplied.id`.
 * Filtros com `jobApplied` (objeto) são descartados silenciosamente — exatamente
 * o bug B1. Se o service voltar a filtrar por `jobApplied`, estes testes quebram.
 */
function mockListJobsAppliedRespectingSelfhostedMap(
	infra: ReturnType<typeof createMockInfra>,
	store: Array<JobApplied & { id: string }>,
) {
	infra.candidateRepository.listJobsApplied.mockImplementation(async (_userId, options) => {
		let result = [...store]
		for (const filter of options?.filters ?? []) {
			if (filter.field === 'jobApplied.id') {
				const targetId =
					typeof filter.value === 'object' &&
					filter.value !== null &&
					'id' in (filter.value as object)
						? String((filter.value as { id: unknown }).id)
						: String(filter.value)
				result = result.filter((app) => app.jobApplied?.id === targetId)
			}
			// demais fields (incl. 'jobApplied') → descartados, como no selfhosted
		}
		const limit = options?.limitTo
		return typeof limit === 'number' ? result.slice(0, limit) : result
	})
}

describe('createJobApplicationService.applyLite', () => {
	function setup(opts?: {
		job?: PostJob
		existing?: JobApplied | null
		/** Store completo de candidaturas do usuário (simula selfhosted). */
		applicationsStore?: Array<JobApplied & { id: string }>
		/** Default true — testes existentes assumem apply lite liberado. */
		applyLiteEnabled?: boolean
	}) {
		const infra = createMockInfra()
		const applyLiteEnabled = opts?.applyLiteEnabled !== false
		infra.companyRepository.getCompany.mockResolvedValue({
			id: COMPANY_ID,
			companyName: 'Acme',
			featureFlags: applyLiteEnabled ? { applyLite: true } : {},
		})
		infra.jobRepository.getJob.mockResolvedValue(opts?.job ?? makeJob())
		infra.userRepository.getUser.mockResolvedValue({
			id: USER_ID,
			display_name: 'Ana',
			email: 'a@b.c',
		})
		infra.userRepository.updateUser.mockResolvedValue(undefined)

		const store: Array<JobApplied & { id: string }> = opts?.applicationsStore
			? [...opts.applicationsStore]
			: opts?.existing
				? [opts.existing as JobApplied & { id: string }]
				: []
		mockListJobsAppliedRespectingSelfhostedMap(infra, store)

		infra.candidateRepository.createJobApplied.mockImplementation(async (_userId, data) => {
			const created = makeCreated({
				...(data as Partial<JobApplied>),
				id: JOB_APPLIED_ID,
				jobApplied: (data as { jobApplied?: { id: string } }).jobApplied ?? { id: JOB_ID },
			})
			store.push(created)
			return created
		})
		infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)
		infra.candidateRepository.setJobInterview.mockResolvedValue(undefined)
		infra.candidateRepository.setCompanyInterview.mockResolvedValue(undefined)
		infra.candidateRepository.getJobInterview.mockResolvedValue(null)
		infra.candidateRepository.getCompanyInterview.mockResolvedValue(null)
		infra.jobRepository.syncPostJobUsersApplied.mockResolvedValue(undefined)
		infra.outboxRepository.insert.mockImplementation(async (event) => event)
		infra.pessoaRepository.findByCpf.mockResolvedValue(null)
		infra.pessoaRepository.create.mockResolvedValue({
			id: '52998224725',
			cpfNormalized: '52998224725',
			linkedUserIds: [],
			linkedUsersCompanyIds: [],
			linkedCandidateProfileIds: [],
		})
		infra.pessoaRepository.linkUser.mockResolvedValue({
			id: '52998224725',
			cpfNormalized: '52998224725',
			linkedUserIds: [USER_ID],
			linkedUsersCompanyIds: [],
			linkedCandidateProfileIds: [],
		})
		infra.pessoaRepository.linkCandidateProfile.mockResolvedValue({
			id: '52998224725',
			cpfNormalized: '52998224725',
			linkedUserIds: [USER_ID],
			linkedUsersCompanyIds: [],
			linkedCandidateProfileIds: [USER_ID],
		})
		return { infra, service: createJobApplicationService(infra), store }
	}

	it('cria candidatura sem mídia e emite candidatura_criada', async () => {
		const { infra, service } = setup()

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			name: 'Ana',
			phone: '11999999999',
		})

		expect(result.created).toBe(true)
		expect(result.appliedWithoutInterview).toBe(true)
		expect(result.action).toBe('continue_interview')
		expect(result.candidateStatus).toBe(APPLY_LITE_STATUS)
		expect(infra.candidateRepository.createJobApplied).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({
				appliedWithoutInterview: true,
				candidateStatus: APPLY_LITE_STATUS,
				jobApplied: { id: JOB_ID },
				companyOwner: { id: COMPANY_ID },
				interview: expect.objectContaining({
					info: [expect.objectContaining({ id: 'q1', video: '', finished: false })],
				}),
			}),
		)
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'candidatura_criada',
				companyId: COMPANY_ID,
				payload: expect.objectContaining({
					applicationId: JOB_APPLIED_ID,
					jobId: JOB_ID,
					candidateId: USER_ID,
					source: 'apply_lite',
				}),
			}),
		)
	})

	it('é idempotente: apply leve + “abrir sessão” (mesmo job) = UMA candidatura', async () => {
		const { infra, service } = setup()

		const first = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
		})
		expect(first.created).toBe(true)
		expect(infra.candidateRepository.createJobApplied).toHaveBeenCalledTimes(1)

		infra.outboxRepository.insert.mockClear()

		const second = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
		})

		expect(second.jobAppliedId).toBe(first.jobAppliedId)
		expect(second.created).toBe(false)
		expect(infra.candidateRepository.createJobApplied).toHaveBeenCalledTimes(1)
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
		// Garante que o filtro enviado é o que o selfhosted entende
		expect(infra.candidateRepository.listJobsApplied).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({
				filters: [{ field: 'jobApplied.id', operator: '==', value: JOB_ID }],
			}),
		)
	})

	it('candidatura em OUTRA vaga não é reutilizada: cria nova e não muta a antiga', async () => {
		const otherApp = makeCreated({
			id: OTHER_JOB_APPLIED_ID,
			jobApplied: { id: OTHER_JOB_ID },
			candidateStatus: 'Approved',
			applicationDraft: { name: 'Original' },
		})
		const { infra, service } = setup({ applicationsStore: [otherApp] })

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			name: 'Ana Nova',
			knockoutAnswers: { age: false },
		})

		expect(result.created).toBe(true)
		expect(result.jobAppliedId).toBe(JOB_APPLIED_ID)
		expect(result.jobId).toBe(JOB_ID)
		expect(infra.candidateRepository.createJobApplied).toHaveBeenCalledTimes(1)
		// Não pode mutar a candidatura da outra vaga
		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalledWith(
			USER_ID,
			OTHER_JOB_APPLIED_ID,
			expect.anything(),
		)
		expect(otherApp.candidateStatus).toBe('Approved')
		expect(otherApp.applicationDraft).toEqual({ name: 'Original' })
	})

	it('não muta candidatura terminal Rejected e devolve status real', async () => {
		const rejected = makeCreated({
			candidateStatus: 'Rejected',
			rejectionReasonCode: 'nao_atende_requisitos',
			rejectionReasonLabel: 'Não atende aos requisitos',
			rejectionEvidence: 'Idade mínima',
		})
		const { infra, service } = setup({
			existing: rejected,
			job: makeJob({ knockoutTree: makeTree() }),
		})

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			name: 'Tentativa overwrite',
			knockoutAnswers: { age: false },
		})

		expect(result.created).toBe(false)
		expect(result.candidateStatus).toBe('Rejected')
		expect(result.action).toBe('rejected')
		expect(result.rejectionReasonCode).toBe('nao_atende_requisitos')
		expect(result.knockoutPassed).toBeNull()
		expect(infra.candidateRepository.createJobApplied).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
	})

	it('não muta candidatura terminal Approved', async () => {
		const approved = makeCreated({ candidateStatus: 'Approved' })
		const { infra, service } = setup({
			existing: approved,
			job: makeJob({ knockoutTree: makeTree() }),
		})

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			name: 'Overwrite draft',
			knockoutAnswers: { age: false },
		})

		expect(result.created).toBe(false)
		expect(result.candidateStatus).toBe('Approved')
		expect(result.action).toBe('continue_interview')
		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		expect(infra.candidateRepository.createJobApplied).not.toHaveBeenCalled()
	})

	it('knockout fail bloqueia com motivo tipado e não segue pra entrevista', async () => {
		const { infra, service } = setup({ job: makeJob({ knockoutTree: makeTree() }) })

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			knockoutAnswers: { age: false },
		})

		expect(result.action).toBe('rejected')
		expect(result.knockoutPassed).toBe(false)
		expect(result.rejectionReasonCode).toBe('nao_atende_requisitos')
		expect(result.rejectionReasonLabel).toBeTruthy()
		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			USER_ID,
			JOB_APPLIED_ID,
			expect.objectContaining({
				candidateStatus: 'Rejected',
				rejectionReasonCode: 'nao_atende_requisitos',
				rejectionDecisionSource: 'knockout',
			}),
		)
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'candidatura_criada' }),
		)
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'screening_knockout' }),
		)
	})

	it('knockout pass segue o fluxo normal (continue_interview)', async () => {
		const { service } = setup({ job: makeJob({ knockoutTree: makeTree() }) })

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
			knockoutAnswers: { age: true },
		})

		expect(result.action).toBe('continue_interview')
		expect(result.knockoutPassed).toBe(true)
		expect(result.rejectionReasonCode).toBeNull()
	})

	it('vaga sem árvore de knockout: comportamento inalterado (cria e segue)', async () => {
		const { infra, service } = setup({ job: makeJob({ knockoutTree: null }) })

		const result = await service.applyLite({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateUserId: USER_ID,
		})

		expect(result.action).toBe('continue_interview')
		expect(result.knockoutPassed).toBeNull()
		expect(infra.candidateRepository.createJobApplied).toHaveBeenCalled()
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'candidatura_criada' }),
		)
		const knockoutWrites = infra.outboxRepository.insert.mock.calls.filter(
			([event]) => event.type === 'screening_knockout',
		)
		expect(knockoutWrites).toHaveLength(0)
	})

	it('company SEM flag applyLite: não cria candidatura, não emite evento, 404 sem vazar feature', async () => {
		const { infra, service } = setup({ applyLiteEnabled: false })

		await expect(
			service.applyLite({
				companyId: COMPANY_ID,
				jobId: JOB_ID,
				candidateUserId: USER_ID,
				name: 'Ana',
			}),
		).rejects.toMatchObject({ message: 'Job not found' })

		expect(infra.candidateRepository.createJobApplied).not.toHaveBeenCalled()
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
		expect(infra.userRepository.updateUser).not.toHaveBeenCalled()
		expect(infra.pessoaRepository.findByCpf).not.toHaveBeenCalled()
	})
})
