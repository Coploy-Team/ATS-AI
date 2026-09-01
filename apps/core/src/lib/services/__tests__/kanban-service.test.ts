import { BadRequestError } from '@coploy/shared/errors'
import { createKanbanService } from '../kanban-service'
import type { RejectionFeedbackEmailClient } from '../rejection-feedback-email'
import { createMockInfra } from './mock-infra'

describe('createKanbanService', () => {
	const COMPANY_ID = 'company-123'
	const JOB_ID = 'job-xyz'
	const INTERVIEW_ID = 'interview-001'
	const USER_ID = 'user-abc'
	const JOB_APPLIED_ID = 'jobapplied-999'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createKanbanService>
	let rejectionFeedbackEmailClient: jest.Mocked<RejectionFeedbackEmailClient>

	beforeEach(() => {
		infra = createMockInfra()
		rejectionFeedbackEmailClient = {
			sendEmail: jest.fn().mockResolvedValue({
				MessageID: 'postmark-message-1',
				SubmittedAt: '2026-08-12T10:00:00.000Z',
				To: 'ana@example.com',
				ErrorCode: 0,
				Message: 'OK',
			}),
		}
		infra.companyRepository.getCompany.mockResolvedValue({ id: COMPANY_ID, companyName: 'Coploy' } as never)
		service = createKanbanService(infra, { rejectionFeedbackEmailClient })
	})

	describe('getKanbanConfig (régua de etapas)', () => {
		it('cai na régua padrão Coploy e marca isDefault quando a vaga nunca configurou', async () => {
			infra.jobRepository.getJob.mockResolvedValue({ id: JOB_ID } as never)

			const config = await service.getKanbanConfig(COMPANY_ID, JOB_ID)

			expect(config.isDefault).toBe(true)
			expect(config.columns.map((c) => c.id)).toEqual([
				'applied',
				'pending',
				'selected',
				'approved',
				'hired',
				// "Sem resposta": candidatura que venceu sem entrevista. Terminal e
				// offTrack como reprovado, mas ninguém avaliou essa pessoa.
				'expired',
				'rejected',
			])
		})

		it('resolve rótulo e semântica de cada etapa para o cliente não duplicar a régua', async () => {
			infra.jobRepository.getJob.mockResolvedValue({ id: JOB_ID } as never)

			const { stages } = await service.getKanbanConfig(COMPANY_ID, JOB_ID)

			expect(stages[0]).toMatchObject({ id: 'applied', label: 'Candidatura', terminal: false })
			expect(stages.find((s) => s.id === 'hired')).toMatchObject({
				label: 'Contratado',
				terminal: true,
			})
			expect(stages.find((s) => s.id === 'rejected')).toMatchObject({ offTrack: true })
		})

		it('preserva a configuração da vaga e usa o rótulo customizado da empresa', async () => {
			infra.jobRepository.getJob.mockResolvedValue({
				id: JOB_ID,
				kanbanConfig: {
					columns: [
						{ id: 'pending', order: 0 },
						{ id: 'teste_tecnico_x1', order: 1 },
						{ id: 'selected', order: 2 },
						{ id: 'approved', order: 3 },
						{ id: 'rejected', order: 4 },
					],
				},
			} as never)
			infra.companyRepository.getCompany.mockResolvedValue({
				id: COMPANY_ID,
				kanbanCustomColumns: [{ id: 'teste_tecnico_x1', label: 'Teste técnico', color: '#22d3ee' }],
			} as never)

			const config = await service.getKanbanConfig(COMPANY_ID, JOB_ID)

			expect(config.isDefault).toBe(false)
			expect(config.stages[1]).toMatchObject({
				id: 'teste_tecnico_x1',
				label: 'Teste técnico',
				canonical: false,
			})
		})
	})

	describe('updateKanbanConfig (convivência régua nova × legada)', () => {
		const legacy = [
			{ id: 'pending', order: 0 },
			{ id: 'selected', order: 1 },
			{ id: 'approved', order: 2 },
			{ id: 'rejected', order: 3 },
		]

		beforeEach(() => {
			infra.jobRepository.getJob.mockResolvedValue({ id: JOB_ID } as never)
		})

		it('aceita configuração legada com pending na entrada', async () => {
			await expect(service.updateKanbanConfig(COMPANY_ID, JOB_ID, legacy)).resolves.toMatchObject({
				columns: legacy,
			})
		})

		it('aceita a régua nova com applied na entrada', async () => {
			const columns = [
				{ id: 'applied', order: 0 },
				{ id: 'pending', order: 1 },
				{ id: 'selected', order: 2 },
				{ id: 'approved', order: 3 },
				{ id: 'hired', order: 4 },
				{ id: 'rejected', order: 5 },
			]
			await expect(service.updateKanbanConfig(COMPANY_ID, JOB_ID, columns)).resolves.toMatchObject({
				columns,
			})
		})

		it('recusa configuração que não começa pela entrada do funil', async () => {
			await expect(
				service.updateKanbanConfig(COMPANY_ID, JOB_ID, [
					{ id: 'selected', order: 0 },
					{ id: 'pending', order: 1 },
					{ id: 'approved', order: 2 },
					{ id: 'rejected', order: 3 },
				]),
			).rejects.toBeInstanceOf(BadRequestError)
		})
	})

	describe('bulkUpdateStatus', () => {
		const interview = {
			id: INTERVIEW_ID,
			user_ref: { id: USER_ID, path: `users/${USER_ID}` },
			name: 'Ana Silva',
			email: 'ana@example.com',
			jobName: 'Engenheiro',
			job_applied_ref: {
				id: JOB_APPLIED_ID,
				path: `users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			},
		}

		it('sends feedback and persists rejection reason for bulk rejected candidates', async () => {
			jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00.000Z'))
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			const result = await service.bulkUpdateStatus({
				companyId: COMPANY_ID,
				candidateIds: [INTERVIEW_ID],
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				rejectionReasonCode: 'nao_atende_requisitos',
				rejectionFeedbackMessage: 'Olá {{nomeCandidato}}, obrigado pela candidatura em {{nomeVaga}} na {{nomeDaEmpresa}}.',
				rejectedByUserId: 'recruiter-1',
			})

			expect(result.results).toEqual([{ candidateId: INTERVIEW_ID, success: true }])
			expect(rejectionFeedbackEmailClient.sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					from: 'no-reply@coploy.io',
					to: 'ana@example.com',
					subject: 'Retorno sobre seu processo seletivo para Engenheiro na Coploy',
					htmlBody: expect.stringContaining('Engenheiro'),
					textBody: expect.stringContaining('Olá Ana Silva, obrigado pela candidatura em Engenheiro na Coploy.'),
					tag: 'rejection-feedback',
				}),
			)
			expect(rejectionFeedbackEmailClient.sendEmail.mock.calls[0][0].htmlBody).not.toContain('Pedir revisão humana')
			expect(rejectionFeedbackEmailClient.sendEmail.mock.calls[0][0].textBody).not.toContain('/revisao')
			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				INTERVIEW_ID,
				expect.objectContaining({
					candidate_status: 'Rejected',
					rejectionReasonCode: 'nao_atende_requisitos',
					rejectionReasonLabel: 'Não atende aos requisitos',
					rejectionDecisionSource: 'bulk',
					rejectionDecidedByUserId: 'recruiter-1',
					rejectionTaxonomyVersion: '2026-08-13',
					rejectionEvidence: null,
					rejectionFeedbackSentAt: new Date('2026-08-12T10:00:00.000Z'),
				}),
			)
			expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
				USER_ID,
				JOB_APPLIED_ID,
				expect.objectContaining({
					candidateStatus: 'Rejected',
					rejectionReasonCode: 'nao_atende_requisitos',
					rejectionReasonLabel: 'Não atende aos requisitos',
					rejectionDecisionSource: 'bulk',
					rejectionDecidedByUserId: 'recruiter-1',
					rejectionTaxonomyVersion: '2026-08-13',
					rejectionEvidence: null,
					rejectionFeedbackSentAt: new Date('2026-08-12T10:00:00.000Z'),
				}),
			)
			expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'candidatura_reprovada',
					companyId: COMPANY_ID,
					payload: expect.objectContaining({
						applicationId: JOB_APPLIED_ID,
						jobId: JOB_ID,
						rejectionReasonCode: 'nao_atende_requisitos',
					}),
				}),
			)
			expect(infra.outboxRepository.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'feedback_enviado',
					companyId: COMPANY_ID,
					payload: expect.objectContaining({
						applicationId: JOB_APPLIED_ID,
						jobId: JOB_ID,
						channel: 'email',
						sentAt: '2026-08-12T10:00:00.000Z',
					}),
				}),
			)
			jest.useRealTimers()
		})

		it('rejects bulk move to rejected without reason before touching candidates', async () => {
			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.getJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})

		it('does not block ambiguous terms but persists risk flags for audit', async () => {
			jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00.000Z'))
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			const result = await service.bulkUpdateStatus({
				companyId: COMPANY_ID,
				candidateIds: [INTERVIEW_ID],
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				rejectionReasonCode: 'nao_atende_requisitos',
				rejectionFeedbackMessage: 'Neste momento não seguiremos por fit cultural com a etapa.',
			})

			expect(result.results).toEqual([{ candidateId: INTERVIEW_ID, success: true }])
			expect(rejectionFeedbackEmailClient.sendEmail).toHaveBeenCalledTimes(1)
			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				INTERVIEW_ID,
				expect.objectContaining({
					rejectionRiskFlags: ['fit_cultural'],
				}),
			)
			expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
				USER_ID,
				JOB_APPLIED_ID,
				expect.objectContaining({
					rejectionRiskFlags: ['fit_cultural'],
				}),
			)
			jest.useRealTimers()
		})

		it('blocks protected terms in bulk internal rejectionNote before touching candidates', async () => {
			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					rejectionReasonCode: 'outro',
					rejectionNote: 'A candidata está grávida e não poderia assumir agora.',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow('nota interna de reprovação contém o termo sensível "grávida"')

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.getJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('deduplicates audit flags from candidate feedback and internal rejectionNote in bulk', async () => {
			jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00.000Z'))
			infra.candidateRepository.getJobInterview.mockResolvedValue({
				...interview,
				rejectionRiskFlags: ['fit_cultural'],
			} as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			const result = await service.bulkUpdateStatus({
				companyId: COMPANY_ID,
				candidateIds: [INTERVIEW_ID],
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				rejectionReasonCode: 'outro',
				rejectionNote: 'Nota interna menciona fit cultural e postura na etapa.',
				rejectionFeedbackMessage: 'Neste momento não seguiremos por fit cultural com a etapa.',
			})

			expect(result.results).toEqual([{ candidateId: INTERVIEW_ID, success: true }])
			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				INTERVIEW_ID,
				expect.objectContaining({
					rejectionNote: 'Nota interna menciona fit cultural e postura na etapa.',
					rejectionRiskFlags: ['fit_cultural', 'postura'],
				}),
			)
			expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
				USER_ID,
				JOB_APPLIED_ID,
				expect.objectContaining({
					rejectionRiskFlags: ['fit_cultural', 'postura'],
				}),
			)
			jest.useRealTimers()
		})

		it('rejects bulk move to rejected without feedback message before updating candidates', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)

			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					rejectionReasonCode: 'nao_atende_requisitos',
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('does not allow legacy rejection_email_sent_at alone to reject candidates in bulk', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)

			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					rejectionReasonCode: 'nao_atende_requisitos',
					rejectionEmailSentAt: '2026-08-12T10:00:00.000Z',
				}),
			).rejects.toThrow(BadRequestError)

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('aborts bulk move before applying updates when feedback email fails', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)
			rejectionFeedbackEmailClient.sendEmail.mockRejectedValue(new Error('postmark down'))

			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					rejectionReasonCode: 'nao_atende_requisitos',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow('postmark down')

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('aborts bulk move before applying partial updates when an interview is missing', async () => {
			infra.candidateRepository.getJobInterview
				.mockResolvedValueOnce(interview as never)
				.mockResolvedValueOnce(null)

			await expect(
				service.bulkUpdateStatus({
					companyId: COMPANY_ID,
					candidateIds: [INTERVIEW_ID, 'missing-interview'],
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					rejectionReasonCode: 'nao_atende_requisitos',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})
	})
})

/**
 * Etapas configuráveis por vaga (V2-304) — as duas regras que protegem o
 * funil e o candidato.
 */
describe('updateKanbanConfig — etapas configuráveis', () => {
	function makeInfra(job: Record<string, unknown>, interviews: unknown[] = []) {
		return {
			jobRepository: {
				getJob: jest.fn().mockResolvedValue(job),
				updateJob: jest.fn().mockResolvedValue(undefined),
			},
			companyRepository: { getCompany: jest.fn().mockResolvedValue({ id: 'c1' }) },
			candidateRepository: { listJobInterviews: jest.fn().mockResolvedValue(interviews) },
		} as never
	}

	it('aceita funil curto: entrada + um terminal', async () => {
		const infra = makeInfra({ id: 'j1' })
		const service = createKanbanService(infra)
		await expect(
			service.updateKanbanConfig('c1', 'j1', [
				{ id: 'applied', order: 0 },
				{ id: 'approved', order: 1 },
			]),
		).resolves.toBeTruthy()
	})

	it('recusa funil sem terminal — ninguém sairia do processo', async () => {
		const service = createKanbanService(makeInfra({ id: 'j1' }))
		await expect(
			service.updateKanbanConfig('c1', 'j1', [
				{ id: 'applied', order: 0 },
				{ id: 'pending', order: 1 },
			]),
		).rejects.toThrow(/terminal/)
	})

	it('recusa remover etapa que ainda tem candidato — some do board sem ter sido movido', async () => {
		const infra = makeInfra(
			{ id: 'j1', kanbanConfig: { columns: [{ id: 'applied', order: 0 }, { id: 'selected', order: 1 }, { id: 'approved', order: 2 }] } },
			[{ id: 'i1', candidateStatus: 'Selected' }],
		)
		const service = createKanbanService(infra)
		await expect(
			service.updateKanbanConfig('c1', 'j1', [
				{ id: 'applied', order: 0 },
				{ id: 'approved', order: 1 },
			]),
		).rejects.toThrow(/Mova os candidatos/)
	})
})
