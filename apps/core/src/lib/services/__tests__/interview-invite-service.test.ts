import { createInterviewInviteService } from '../interview-invite-service'
import { createMockInfra } from './mock-infra'

describe('createInterviewInviteService', () => {
	const COMPANY_ID = 'company-1'
	const JOB_ID = 'job-1'

	let infra: ReturnType<typeof createMockInfra>
	let emailClient: { sendEmail: jest.Mock }

	function interviewDoc(overrides: Record<string, unknown> = {}) {
		return {
			email: 'ana@example.com',
			name: 'Ana Silva',
			language: 'pt-BR',
			candidateStatus: 'Applied',
			user_ref: { path: 'users/user-1' },
			job_applied_ref: { path: 'users/user-1/jobsApplied/ja-1' },
			...overrides,
		}
	}

	beforeEach(() => {
		infra = createMockInfra()
		emailClient = { sendEmail: jest.fn().mockResolvedValue({ MessageID: 'pm-1' }) }
		infra.companyRepository.getCompany.mockResolvedValue({
			id: COMPANY_ID,
			companyName: 'Coploy',
		} as never)
		infra.jobRepository.getJob.mockResolvedValue({
			id: JOB_ID,
			jobName: 'Engenheira de Software',
		} as never)
		infra.candidateRepository.getJobInterview.mockResolvedValue(interviewDoc() as never)
		// mocks precisam devolver promise: o service encadeia .catch() em tudo
		// que é best-effort (espelho e evento não podem derrubar o convite)
		infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined as never)
		infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined as never)
		infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined as never)
		infra.outboxRepository.insert.mockResolvedValue(undefined as never)
	})

	function service() {
		return createInterviewInviteService(infra, { emailClient })
	}

	it('move o candidato para a etapa de entrevista e envia o link', async () => {
		const result = await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		expect(result).toMatchObject({ invited: 1, sent: 1 })
		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
			COMPANY_ID,
			JOB_ID,
			'cand-1',
			expect.objectContaining({ candidateStatus: 'Pending', candidate_status: 'Pending' }),
		)
		// o espelho em jobsApplied também precisa mover, senão a área do
		// candidato mostra estado diferente do board
		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			'user-1',
			'ja-1',
			expect.objectContaining({ candidateStatus: 'Pending' }),
		)
		expect(emailClient.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'ana@example.com', tag: 'interview-invite' }),
		)
	})

	it('reinicia o relógio da etapa ao convidar', async () => {
		await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		const [, , , update] = infra.candidateRepository.updateJobInterview.mock.calls[0]
		expect(update).toHaveProperty('dateSelect')
		expect(update).toHaveProperty('interviewInvitedAt')
	})

	it('o link aponta para a página de entrevista da vaga', async () => {
		const { interviewUrl } = await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		expect(interviewUrl).toContain(`/job/${JOB_ID}/company/${COMPANY_ID}/login`)
	})

	// O status é o dado do funil: não pode ficar refém do provedor de e-mail.
	it('move mesmo quando o candidato não tem e-mail', async () => {
		infra.candidateRepository.getJobInterview.mockResolvedValue(
			interviewDoc({ email: null }) as never,
		)

		const result = await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalled()
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
		expect(result.results[0]).toMatchObject({
			status: 'moved_without_email',
			reason: 'no_email',
		})
	})

	it('move mesmo quando o envio falha, e reporta por candidato', async () => {
		emailClient.sendEmail.mockRejectedValue(new Error('postmark down'))

		const result = await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		expect(result).toMatchObject({ invited: 1, sent: 0 })
		expect(result.results[0]).toMatchObject({ reason: 'email_failed' })
	})

	it('pula candidato inexistente sem derrubar o lote', async () => {
		infra.candidateRepository.getJobInterview
			.mockResolvedValueOnce(null as never)
			.mockResolvedValueOnce(interviewDoc() as never)

		const result = await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['sumiu', 'cand-2'],
		})

		expect(result).toMatchObject({ invited: 1, sent: 1 })
		expect(result.results[0]).toMatchObject({ status: 'skipped', reason: 'not_found' })
	})

	it('registra o movimento no outbox para o funil ter histórico', async () => {
		await service().inviteToInterview({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateIds: ['cand-1'],
		})

		expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'candidatura_movida',
				payload: expect.objectContaining({ fromStatus: 'Applied', toStatus: 'Pending' }),
			}),
		)
	})

	it('recusa lote acima do teto', async () => {
		await expect(
			service().inviteToInterview({
				companyId: COMPANY_ID,
				jobId: JOB_ID,
				candidateIds: Array.from({ length: 51 }, (_, i) => `c-${i}`),
			}),
		).rejects.toThrow(/50/)
	})
})
