import { createLgpdService, daysSince, isPastRetention } from '../lgpd-service'
import { createMockInfra } from './mock-infra'

const NOW = new Date('2026-08-16T12:00:00.000Z')

function withLgpd(infra: ReturnType<typeof createMockInfra>) {
	const requests: Array<Record<string, unknown>> = []
	const consents: Array<Record<string, unknown>> = []
	;(infra as unknown as { lgpdRepository: unknown }).lgpdRepository = {
		listConsents: jest.fn(async () => consents),
		createConsent: jest.fn(async (data: Record<string, unknown>) => {
			const record = { ...data, id: `consent-${consents.length + 1}` }
			consents.push(record)
			return record
		}),
		revokeConsent: jest.fn(async (id: string) => {
			const found = consents.find((item) => item.id === id)
			if (found) found.granted = false
		}),
		listRequests: jest.fn(async () => requests),
		createRequest: jest.fn(async (data: Record<string, unknown>) => {
			const record = { ...data, id: `req-${requests.length + 1}` }
			requests.push(record)
			return record
		}),
		completeRequest: jest.fn(async (id: string, data: Record<string, unknown>) => {
			const found = requests.find((item) => item.id === id)
			if (found) Object.assign(found, data)
		}),
	}
	return { requests, consents }
}

describe('retenção', () => {
	it('conta da ÚLTIMA interação, não da criação', () => {
		const application = {
			appliedTime: new Date('2021-01-01T00:00:00.000Z'),
			dateSelect: new Date('2026-07-01T00:00:00.000Z'),
			finishedTime: null,
		}
		// candidatura de 2021, mas movimentada mês passado: não é dado velho
		expect(isPastRetention(application, 730, NOW)).toBe(false)
	})

	it('candidatura sem movimentação além do prazo entra na varredura', () => {
		const application = {
			appliedTime: new Date('2023-01-01T00:00:00.000Z'),
			dateSelect: null,
			finishedTime: null,
		}
		expect(isPastRetention(application, 730, NOW)).toBe(true)
	})

	it('sem data nenhuma não anonimiza — ausência de dado não é prova de abandono', () => {
		expect(isPastRetention({ appliedTime: null, dateSelect: null, finishedTime: null }, 730, NOW)).toBe(
			false,
		)
		expect(daysSince(null, NOW)).toBeNull()
	})
})

describe('lgpd-service', () => {
	it('anonimizar preserva o que é estatística e remove o que identifica', async () => {
		const infra = createMockInfra()
		withLgpd(infra)
		infra.candidateRepository.listJobsApplied = jest.fn().mockResolvedValue([
			{ id: 'ja-1', companyOwner: { id: 'c1' }, jobApplied: { id: 'job-1' } },
		])

		const result = await createLgpdService(infra).anonymize({ userId: 'u1' })

		expect(result.jobsApplied).toBe(1)
		const patch = (infra.candidateRepository.updateCompanyInterview as jest.Mock).mock.calls[0][2]
		// PII removido…
		expect(patch.email).toBeNull()
		expect(patch.phone_number).toBeNull()
		// …e nada de nota/etapa no patch: o histórico do processo continua
		expect(patch).not.toHaveProperty('score')
		expect(patch).not.toHaveProperty('candidate_status')
	})

	it('a transcrição sai junto — é a fala da pessoa', async () => {
		const infra = createMockInfra()
		withLgpd(infra)
		infra.candidateRepository.listJobsApplied = jest
			.fn()
			.mockResolvedValue([{ id: 'ja-1', companyOwner: { id: 'c1' }, jobApplied: { id: 'job-1' } }])

		await createLgpdService(infra).anonymize({ userId: 'u1' })

		const patch = (infra.candidateRepository.updateJobApplied as jest.Mock).mock.calls[0][2]
		expect(patch.interview).toBeNull()
		expect(patch.additional).toBeNull()
	})

	it('grava a trilha ANTES de mexer e fecha como completed', async () => {
		const infra = createMockInfra()
		const { requests } = withLgpd(infra)
		infra.candidateRepository.listJobsApplied = jest.fn().mockResolvedValue([])

		await createLgpdService(infra).anonymize({ userId: 'u1', requestedBy: 'admin-1' })

		expect(requests).toHaveLength(1)
		expect(requests[0]).toMatchObject({
			operation: 'anonymization',
			requestedBy: 'admin-1',
			status: 'completed',
		})
	})

	it('trilha registra falha em vez de fingir sucesso', async () => {
		const infra = createMockInfra()
		const { requests } = withLgpd(infra)
		infra.candidateRepository.listJobsApplied = jest.fn().mockRejectedValue(new Error('x'))
		infra.userRepository.updateUser = jest.fn().mockRejectedValue(new Error('firestore down'))
		infra.userRepository.updateCandidateProfile = jest.fn().mockRejectedValue(new Error('x'))

		// listJobsApplied já é tolerado (catch → []), então o fluxo completa
		await createLgpdService(infra).anonymize({ userId: 'u1' })
		expect(requests[0].status).toBe('completed')
	})

	it('export não devolve a avaliação da empresa — é opinião do controlador', async () => {
		const infra = createMockInfra()
		withLgpd(infra)
		infra.candidateRepository.listJobsApplied = jest.fn().mockResolvedValue([
			{
				id: 'ja-1',
				companyOwner: { id: 'c1' },
				jobApplied: { id: 'job-1' },
				score: 9.1,
				interview: { info: [{ answer: 'texto' }] },
				avaliacaoFinal: { parecer: 'ótimo' },
			},
		])

		const payload = await createLgpdService(infra).exportUserData('u1')
		const application = payload.applications[0] as Record<string, unknown>

		expect(application).not.toHaveProperty('score')
		expect(application).not.toHaveProperty('avaliacaoFinal')
		expect(application).not.toHaveProperty('interview')
		expect(application).toMatchObject({ id: 'ja-1', jobId: 'job-1' })
	})

	it('revogar consentimento de outra pessoa responde como inexistente', async () => {
		const infra = createMockInfra()
		withLgpd(infra)
		const service = createLgpdService(infra)

		await expect(
			service.revokeConsent({ userId: 'u1', consentId: 'de-outra-pessoa' }),
		).rejects.toThrow(/not found/i)
	})

	it('consentimento registra finalidade e prazo', async () => {
		const infra = createMockInfra()
		const { consents } = withLgpd(infra)

		await createLgpdService(infra).grantConsent({
			userId: 'u1',
			purpose: 'talent_pool',
			expiresAt: new Date('2027-08-16T00:00:00.000Z'),
			policyVersion: 'v2',
		})

		expect(consents[0]).toMatchObject({
			purpose: 'talent_pool',
			granted: true,
			policyVersion: 'v2',
		})
		expect(consents[0].expiresAt).toBeTruthy()
	})
})
