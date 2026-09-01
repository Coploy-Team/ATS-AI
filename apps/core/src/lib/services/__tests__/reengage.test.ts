import { createInterviewInviteService } from '../interview-invite-service'
import { createMockInfra } from './mock-infra'

jest.mock('@/env', () => ({
	env: { INTERVIEW_BASE_URL: 'https://interview.test.io' },
}))

function setup(overrides: { job?: Record<string, unknown>; user?: Record<string, unknown> } = {}) {
	const infra = createMockInfra()
	infra.companyRepository.getCompany = jest
		.fn()
		.mockResolvedValue({ id: 'c1', companyName: 'Coploy' })
	infra.jobRepository.getJob = jest
		.fn()
		.mockResolvedValue({ id: 'job-1', jobName: 'Dev', stopped: false, ...overrides.job })
	infra.userRepository.getUser = jest.fn().mockResolvedValue({
		email: 'ana@example.com',
		display_name: 'Ana',
		language: 'pt-BR',
		...overrides.user,
	})
	infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue(null)

	const sendEmail = jest.fn().mockResolvedValue(undefined)
	const service = createInterviewInviteService(infra, { emailClient: { sendEmail } as never })
	return { infra, service, sendEmail }
}

describe('reengageToJob (V2-603)', () => {
	it('manda o convite com origem `invite` no link', async () => {
		const { service, sendEmail } = setup()

		const result = await service.reengageToJob({
			companyId: 'c1',
			jobId: 'job-1',
			userIds: ['u1'],
		})

		expect(result.sent).toBe(1)
		expect(result.interviewUrl).toContain('src=invite')
		expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.com' }))
	})

	it('NÃO cria candidatura — quem entra no funil é o candidato', async () => {
		const { infra, service } = setup()

		await service.reengageToJob({ companyId: 'c1', jobId: 'job-1', userIds: ['u1'] })

		expect(infra.candidateRepository.createJobApplied).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
	})

	it('recusa vaga fechada antes de mandar o primeiro e-mail', async () => {
		const { service, sendEmail } = setup({ job: { stopped: true } })

		await expect(
			service.reengageToJob({ companyId: 'c1', jobId: 'job-1', userIds: ['u1'] }),
		).rejects.toThrow(/not open/i)
		expect(sendEmail).not.toHaveBeenCalled()
	})

	it('pessoa sem e-mail é pulada e reportada, sem derrubar as demais', async () => {
		const { infra, service, sendEmail } = setup()
		infra.userRepository.getUser = jest
			.fn()
			.mockResolvedValueOnce({ display_name: 'Sem contato' })
			.mockResolvedValueOnce({ email: 'bruno@example.com', display_name: 'Bruno' })

		const result = await service.reengageToJob({
			companyId: 'c1',
			jobId: 'job-1',
			userIds: ['u1', 'u2'],
		})

		expect(result.sent).toBe(1)
		expect(result.results[0]).toMatchObject({ status: 'skipped', reason: 'no_email' })
		expect(sendEmail).toHaveBeenCalledTimes(1)
	})

	it('falha de e-mail não interrompe o lote', async () => {
		const { service, sendEmail } = setup()
		sendEmail.mockRejectedValueOnce(new Error('postmark down'))

		const result = await service.reengageToJob({
			companyId: 'c1',
			jobId: 'job-1',
			userIds: ['u1', 'u2'],
		})

		expect(result.sent).toBe(1)
		expect(result.results[0]).toMatchObject({ status: 'skipped', reason: 'email_failed' })
	})

	it('o idioma da PESSOA ganha do idioma da vaga', async () => {
		/*
		 * Achado enviando um convite de verdade: o idioma mora no currículo, não
		 * no doc de identidade. Lendo só `users/{uid}`, um candidato brasileiro
		 * recebeu "Interview invitation" em inglês porque a VAGA estava em inglês.
		 */
		const { infra, service, sendEmail } = setup({ job: { language: 'en' } })
		infra.userRepository.getUser = jest.fn().mockResolvedValue({ email: 'ana@example.com' })
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue({ language: 'pt-BR' })

		await service.reengageToJob({ companyId: 'c1', jobId: 'job-1', userIds: ['u1'] })

		const enviado = sendEmail.mock.calls[0][0]
		expect(enviado.subject).toMatch(/entrevista/i)
		expect(enviado.subject).not.toMatch(/Interview invitation/i)
	})

	it('sem idioma da pessoa, a vaga decide — palpite melhor que o default', async () => {
		const { infra, service, sendEmail } = setup({ job: { language: 'en' } })
		infra.userRepository.getUser = jest.fn().mockResolvedValue({ email: 'ana@example.com' })
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue(null)

		await service.reengageToJob({ companyId: 'c1', jobId: 'job-1', userIds: ['u1'] })

		expect(sendEmail.mock.calls[0][0].subject).toMatch(/Interview invitation/i)
	})

	it('e-mail só no currículo ainda alcança a pessoa', async () => {
		const { infra, service, sendEmail } = setup()
		infra.userRepository.getUser = jest.fn().mockResolvedValue({ display_name: 'Ana' })
		infra.userRepository.getCandidateProfile = jest
			.fn()
			.mockResolvedValue({ email: 'ana@curriculo.com' })

		const result = await service.reengageToJob({
			companyId: 'c1',
			jobId: 'job-1',
			userIds: ['u1'],
		})

		expect(result.sent).toBe(1)
		expect(sendEmail.mock.calls[0][0].to).toBe('ana@curriculo.com')
	})
})
