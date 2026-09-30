jest.mock('@/env', () => ({
	env: {
		NODE_ENV: 'testing',
		INFRA_PROVIDER: 'gcp',
		CORE_API_KEY: 'test-api-key',
		ENGINE_URL: 'http://engine.test',
		INTEGRATION_URL: 'http://integration.test',
		INTERVIEW_BASE_URL: 'https://interview.test',
		OUTBOX_PUBLISHER_TOPIC: 'talent-domain-events',
		OUTBOX_PUBLISHER_BATCH_LIMIT: 50,
		OUTBOX_PUBLISHER_INTERVAL_MS: 30_000,
	},
}))

import type { CompanyInterview, PostJob } from '@coploy/domain'
import { ANTI_GHOSTING_CONFIG } from '../anti-ghosting-config'
import { computeSlaMetrics, isGracePeriodExpired } from '../anti-ghosting-sla-metrics'
import { createAntiGhostingSlaService } from '../anti-ghosting-sla-service'
import { createMockInfra } from './mock-infra'

const NOW = new Date('2026-08-13T12:00:00.000Z')

function hoursAgo(hours: number, now: Date = NOW): Date {
	return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

function makeInterview(overrides: Partial<CompanyInterview> = {}): CompanyInterview {
	return {
		id: 'interview-1',
		company_id: 'company-1',
		post_job_id: 'job-1',
		user_id: 'user-1',
		email: 'candidato@example.com',
		name: 'Candidato',
		candidateStatus: 'pending',
		date: hoursAgo(48),
		job_applied_ref: { id: 'app-1', path: 'users/user-1/jobsApplied/app-1' },
		user_ref: { id: 'user-1', path: 'users/user-1' },
		...overrides,
	}
}

function makeJob(overrides: Partial<PostJob> = {}): PostJob & { companyId?: string } {
	return {
		id: 'job-1',
		jobName: 'Engenheira',
		companyName: 'Coploy',
		creatorName: 'Marina',
		creatorEmail: 'marina@coploy.io',
		language: 'pt-BR',
		antiGhostingEnabled: true,
		feedbackSlaHours: 24,
		public: true,
		stopped: false,
		archived: false,
		...overrides,
	}
}

describe('computeSlaMetrics (limiar 30%)', () => {
	const slaHours = 24

	it('abaixo do limiar: não é irregular', () => {
		// 2/10 = 20% overdue
		const interviews = [
			...Array.from({ length: 2 }, (_, i) =>
				makeInterview({ id: `overdue-${i}`, date: hoursAgo(48) }),
			),
			...Array.from({ length: 8 }, (_, i) =>
				makeInterview({ id: `fresh-${i}`, date: hoursAgo(1) }),
			),
		]

		const metrics = computeSlaMetrics(interviews, slaHours, NOW)
		expect(metrics.ratio).toBeCloseTo(0.2)
		expect(metrics.isIrregular).toBe(false)
	})

	it('no limite exato (30%): NÃO é irregular (só >30%)', () => {
		// 3/10 = 30%
		const interviews = [
			...Array.from({ length: 3 }, (_, i) =>
				makeInterview({ id: `overdue-${i}`, date: hoursAgo(48) }),
			),
			...Array.from({ length: 7 }, (_, i) =>
				makeInterview({ id: `fresh-${i}`, date: hoursAgo(1) }),
			),
		]

		const metrics = computeSlaMetrics(interviews, slaHours, NOW)
		expect(metrics.ratio).toBeCloseTo(0.3)
		expect(metrics.isIrregular).toBe(false)
	})

	it('acima do limiar: é irregular', () => {
		// 4/10 = 40%
		const interviews = [
			...Array.from({ length: 4 }, (_, i) =>
				makeInterview({ id: `overdue-${i}`, date: hoursAgo(48) }),
			),
			...Array.from({ length: 6 }, (_, i) =>
				makeInterview({ id: `fresh-${i}`, date: hoursAgo(1) }),
			),
		]

		const metrics = computeSlaMetrics(interviews, slaHours, NOW)
		expect(metrics.ratio).toBeCloseTo(0.4)
		expect(metrics.isIrregular).toBe(true)
	})

	it('ignora candidaturas terminalizadas no denominador de ativas', () => {
		const interviews = [
			makeInterview({ id: 'overdue-1', date: hoursAgo(48) }),
			makeInterview({ id: 'rejected-1', candidateStatus: 'Rejected', date: hoursAgo(72) }),
			makeInterview({ id: 'approved-1', candidateStatus: 'approved', date: hoursAgo(72) }),
		]

		const metrics = computeSlaMetrics(interviews, slaHours, NOW)
		expect(metrics.activeCount).toBe(1)
		expect(metrics.overdueWithoutDecisionCount).toBe(1)
		expect(metrics.isIrregular).toBe(true)
	})
})

describe('createAntiGhostingSlaService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let emailClient: { sendEmail: jest.Mock }
	let service: ReturnType<typeof createAntiGhostingSlaService>

	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(NOW)

		infra = createMockInfra()
		emailClient = {
			sendEmail: jest.fn().mockResolvedValue({
				MessageID: 'postmark-1',
				SubmittedAt: NOW.toISOString(),
				To: 'x@y.com',
				ErrorCode: 0,
				Message: 'OK',
			}),
		}
		service = createAntiGhostingSlaService(infra, emailClient)

		infra.outboxRepository.insert.mockImplementation(async (event) => event)
		infra.companyRepository.listCompanies.mockResolvedValue([
			{ id: 'company-1', featureFlags: { antiGhosting: true } },
		] as never)
		infra.companyRepository.getCompany.mockResolvedValue({
			id: 'company-1',
			featureFlags: { antiGhosting: true },
		} as never)
		infra.jobRepository.listJobs.mockResolvedValue([makeJob()] as never)
		infra.jobRepository.updateJob.mockResolvedValue(undefined)
		infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
		infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
		infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('envia ack idempotente e não reenvia na segunda passagem', async () => {
		const interview = makeInterview({ ackSentAt: null, date: hoursAgo(2) })
		infra.candidateRepository.listJobInterviews.mockResolvedValue([interview] as never)

		const first = await service.run(NOW)
		expect(first.acksSent).toBe(1)
		expect(emailClient.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ tag: 'application-ack', to: 'candidato@example.com' }),
		)
		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			'user-1',
			'app-1',
			expect.objectContaining({ ackSentAt: NOW }),
		)

		emailClient.sendEmail.mockClear()
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			{ ...interview, ackSentAt: NOW },
		] as never)

		const second = await service.run(NOW)
		expect(second.acksSent).toBe(0)
		expect(emailClient.sendEmail).not.toHaveBeenCalledWith(
			expect.objectContaining({ tag: 'application-ack' }),
		)
	})

	it('acima do limiar: alerta e NÃO auto-stop antes da carência de 48h', async () => {
		const interviews = Array.from({ length: 4 }, (_, i) =>
			makeInterview({ id: `ov-${i}`, date: hoursAgo(48), email: `c${i}@ex.com` }),
		).concat(
			Array.from({ length: 6 }, (_, i) =>
				makeInterview({ id: `fr-${i}`, date: hoursAgo(1), email: `f${i}@ex.com` }),
			),
		)
		infra.candidateRepository.listJobInterviews.mockResolvedValue(interviews as never)

		const result = await service.run(NOW)
		expect(result.alertsSent).toBe(1)
		expect(result.jobsAutoStopped).toBe(0)
		expect(emailClient.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ tag: 'sla-alert', to: 'marina@coploy.io' }),
		)
		expect(infra.jobRepository.updateJob).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			expect.objectContaining({
				slaIrregularSince: NOW,
				slaAlertSentAt: NOW,
			}),
		)
		expect(infra.jobRepository.updateJob).not.toHaveBeenCalledWith(
			'company-1',
			'job-1',
			expect.objectContaining({ stopped: true }),
		)
	})

	it('após carência 48h: auto-stop e tira de public', async () => {
		const irregularSince = hoursAgo(ANTI_GHOSTING_CONFIG.gracePeriodHours)
		infra.jobRepository.listJobs.mockResolvedValue([
			makeJob({
				slaIrregularSince: irregularSince,
				slaAlertSentAt: irregularSince,
				public: true,
			}),
		] as never)

		const interviews = Array.from({ length: 4 }, (_, i) =>
			makeInterview({
				id: `ov-${i}`,
				date: hoursAgo(72),
				email: `c${i}@ex.com`,
				ackSentAt: hoursAgo(70),
			}),
		).concat(
			Array.from({ length: 6 }, (_, i) =>
				makeInterview({
					id: `fr-${i}`,
					date: hoursAgo(1),
					email: `f${i}@ex.com`,
					ackSentAt: hoursAgo(1),
				}),
			),
		)
		infra.candidateRepository.listJobInterviews.mockResolvedValue(interviews as never)

		const result = await service.run(NOW)
		expect(result.jobsAutoStopped).toBe(1)
		expect(infra.jobRepository.updateJob).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			expect.objectContaining({
				stopped: true,
				public: false,
				slaAutoStoppedByAntiGhosting: true,
				slaPublicBeforeAutoStop: true,
			}),
		)
	})

	it('regularização religa a vaga auto-stopada', async () => {
		infra.jobRepository.listJobs.mockResolvedValue([
			makeJob({
				stopped: true,
				public: false,
				slaIrregularSince: hoursAgo(72),
				slaAlertSentAt: hoursAgo(72),
				slaAutoStoppedAt: hoursAgo(24),
				slaAutoStoppedByAntiGhosting: true,
				slaPublicBeforeAutoStop: true,
			}),
		] as never)

		// Agora abaixo do limiar (1/10 = 10%)
		const interviews = [
			makeInterview({ id: 'ov-1', date: hoursAgo(48), ackSentAt: hoursAgo(40) }),
			...Array.from({ length: 9 }, (_, i) =>
				makeInterview({
					id: `ok-${i}`,
					date: hoursAgo(1),
					ackSentAt: hoursAgo(1),
					email: `ok${i}@ex.com`,
				}),
			),
		]
		infra.candidateRepository.listJobInterviews.mockResolvedValue(interviews as never)

		const result = await service.run(NOW)
		expect(result.jobsReopened).toBe(1)
		expect(infra.jobRepository.updateJob).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			expect.objectContaining({
				stopped: false,
				public: true,
				slaAutoStoppedByAntiGhosting: false,
				slaIrregularSince: null,
				slaAlertSentAt: null,
			}),
		)
	})

	it('gate bloqueia publicar enquanto irregular', async () => {
		const interviews = Array.from({ length: 4 }, (_, i) =>
			makeInterview({ id: `ov-${i}`, date: hoursAgo(48) }),
		).concat(
			Array.from({ length: 6 }, (_, i) =>
				makeInterview({ id: `fr-${i}`, date: hoursAgo(1) }),
			),
		)
		infra.candidateRepository.listJobInterviews.mockResolvedValue(interviews as never)

		await expect(
			service.assertCanPublishOrUnstop({
				companyId: 'company-1',
				job: makeJob(),
				wantsPublic: true,
				now: NOW,
			}),
		).rejects.toThrow(/SLA anti-ghosting/)
	})

	it('vagas sem antiGhostingEnabled (legado) são no-op', async () => {
		infra.jobRepository.listJobs.mockResolvedValue([
			makeJob({ antiGhostingEnabled: undefined }),
		] as never)
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			makeInterview({ date: hoursAgo(100) }),
		] as never)

		const result = await service.run(NOW)
		expect(result.jobsScanned).toBe(0)
		expect(result.acksSent).toBe(0)
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
	})

	it('company SEM flag antiGhosting: zero efeito mesmo com toggle da vaga ligado', async () => {
		infra.companyRepository.listCompanies.mockResolvedValue([
			{ id: 'company-1', featureFlags: {} },
		] as never)
		infra.jobRepository.listJobs.mockResolvedValue([
			makeJob({ antiGhostingEnabled: true }),
		] as never)
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			makeInterview({ date: hoursAgo(100), ackSentAt: null }),
		] as never)

		const result = await service.run(NOW)

		expect(result.companiesScanned).toBe(0)
		expect(result.jobsScanned).toBe(0)
		expect(result.acksSent).toBe(0)
		expect(result.alertsSent).toBe(0)
		expect(result.jobsAutoStopped).toBe(0)
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
		expect(infra.jobRepository.listJobs).not.toHaveBeenCalled()
		expect(infra.jobRepository.updateJob).not.toHaveBeenCalled()
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
	})

	it('gate de publicação é no-op sem flag do tenant (mesmo irregular)', async () => {
		infra.companyRepository.getCompany.mockResolvedValue({
			id: 'company-1',
			featureFlags: { antiGhosting: false },
		} as never)
		const interviews = Array.from({ length: 4 }, (_, i) =>
			makeInterview({ id: `ov-${i}`, date: hoursAgo(48) }),
		).concat(
			Array.from({ length: 6 }, (_, i) =>
				makeInterview({ id: `fr-${i}`, date: hoursAgo(1) }),
			),
		)
		infra.candidateRepository.listJobInterviews.mockResolvedValue(interviews as never)

		await expect(
			service.assertCanPublishOrUnstop({
				companyId: 'company-1',
				job: makeJob({ antiGhostingEnabled: true }),
				wantsPublic: true,
				now: NOW,
			}),
		).resolves.toBeUndefined()

		expect(infra.candidateRepository.listJobInterviews).not.toHaveBeenCalled()
	})

	it('falha parcial no write: não envia e-mail; com ackSentAt no JobInterview a próxima rodada também não reenvia', async () => {
		// Comportamento documentado (mark-before-send):
		// 1) updateJobInterview grava ackSentAt; 2) updateCompanyInterview falha;
		// 3) e-mail NÃO sai nesta rodada; 4) próxima rodada lê JobInterview com ackSentAt → sem reenvio.
		const interview = makeInterview({ ackSentAt: null, date: hoursAgo(2) })
		infra.candidateRepository.listJobInterviews.mockResolvedValue([interview] as never)
		infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
		infra.candidateRepository.updateCompanyInterview.mockRejectedValueOnce(
			new Error('write fail'),
		)

		await expect(service.run(NOW)).rejects.toThrow('write fail')
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			'interview-1',
			expect.objectContaining({ ackSentAt: NOW }),
		)

		emailClient.sendEmail.mockClear()
		infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			{ ...interview, ackSentAt: NOW },
		] as never)

		const second = await service.run(NOW)
		expect(second.acksSent).toBe(0)
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
	})

	it('falha do Postmark reverte ackSentAt (próxima rodada pode tentar de novo)', async () => {
		const interview = makeInterview({ ackSentAt: null, date: hoursAgo(2) })
		infra.candidateRepository.listJobInterviews.mockResolvedValue([interview] as never)
		emailClient.sendEmail.mockRejectedValueOnce(new Error('postmark down'))

		await expect(service.run(NOW)).rejects.toThrow('postmark down')

		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			'interview-1',
			expect.objectContaining({ ackSentAt: NOW }),
		)
		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			'interview-1',
			expect.objectContaining({ ackSentAt: null }),
		)
		expect(infra.candidateRepository.updateCompanyInterview).toHaveBeenCalledWith(
			'company-1',
			'interview-1',
			expect.objectContaining({ ackSentAt: null }),
		)
	})

	it('listCompanies é chamado uma vez por run', async () => {
		infra.candidateRepository.listJobInterviews.mockResolvedValue([])
		await service.run(NOW)
		expect(infra.companyRepository.listCompanies).toHaveBeenCalledTimes(1)
	})

	it('assertCanPublishOrUnstop usa company do caller sem refetch', async () => {
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			makeInterview({ id: 'fresh-1', date: hoursAgo(1) }),
		] as never)

		await expect(
			service.assertCanPublishOrUnstop({
				companyId: 'company-1',
				company: { id: 'company-1', featureFlags: { antiGhosting: true } },
				job: makeJob(),
				wantsPublic: true,
				now: NOW,
			}),
		).resolves.toBeUndefined()

		expect(infra.companyRepository.getCompany).not.toHaveBeenCalled()
	})
})

describe('isGracePeriodExpired', () => {
	it('expira exatamente em 48h', () => {
		const since = hoursAgo(48)
		expect(isGracePeriodExpired(since, NOW)).toBe(true)
		expect(isGracePeriodExpired(hoursAgo(47), NOW)).toBe(false)
	})
})
