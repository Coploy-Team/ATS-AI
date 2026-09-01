import { BadRequestError } from '@coploy/shared/errors'
import { createInterviewsService } from '../interviews-service'
import type { RejectionFeedbackEmailClient } from '../rejection-feedback-email'
import { createMockInfra } from './mock-infra'

// env vars are set in jest.setup.ts (setupFiles)

describe('createInterviewsService', () => {
	const COMPANY_ID = 'company-123'
	const USER_ID = 'user-abc'
	const JOB_ID = 'job-xyz'
	const INTERVIEW_ID = 'interview-001'
	const JOB_APPLIED_ID = 'jobapplied-999'

	const makeInterview = (overrides = {}) => ({
		id: INTERVIEW_ID,
		companyId: COMPANY_ID,
		finished: true,
		date: new Date('2024-01-15').toISOString(),
		dateSelect: null,
		name: 'Ana Silva',
		email: 'ana@example.com',
		jobName: 'Engenheiro',
		user_ref: { id: USER_ID, path: `users/${USER_ID}` },
		job_applied_ref: { id: JOB_APPLIED_ID, path: `users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}` },
		job_ref: { id: JOB_ID },
		batchProcessing: null,
		candidateStatus: 'pending',
		...overrides,
	})

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createInterviewsService>
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
		service = createInterviewsService(infra, { rejectionFeedbackEmailClient })
	})

	// ─── Direct accessors ────────────────────────────────────────────────────

	describe('getUsersCompany', () => {
		it('delegates to userRepository.getUsersCompany', async () => {
			const mockMembership = { id: USER_ID, company: COMPANY_ID }
			infra.userRepository.getUsersCompany.mockResolvedValue(mockMembership as never)

			const result = await service.getUsersCompany(USER_ID)

			expect(infra.userRepository.getUsersCompany).toHaveBeenCalledWith(USER_ID)
			expect(result).toEqual(mockMembership)
		})
	})

	describe('getJobApplied', () => {
		it('delegates to candidateRepository.getJobApplied', async () => {
			const mockJobApplied = { id: JOB_APPLIED_ID, userId: USER_ID }
			infra.candidateRepository.getJobApplied.mockResolvedValue(mockJobApplied as never)

			const result = await service.getJobApplied(USER_ID, JOB_APPLIED_ID)

			expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(USER_ID, JOB_APPLIED_ID)
			expect(result).toEqual(mockJobApplied)
		})
	})

	describe('listCompanyInterviews', () => {
		it('delegates to candidateRepository.listCompanyInterviews', async () => {
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([])

			await service.listCompanyInterviews(COMPANY_ID)

			expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(COMPANY_ID, undefined)
		})

		it('forwards options', async () => {
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([])
			const options = { filters: [{ field: 'finished', operator: '==' as const, value: true }] }

			await service.listCompanyInterviews(COMPANY_ID, options)

			expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(COMPANY_ID, options)
		})
	})

	// ─── listInterviews: optimized path (page=1, limit≤10, no search) ────────

	describe('listInterviews', () => {
		it('uses optimized query when page=1, limit<=10 and no search term', async () => {
			const interview = makeInterview()
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([interview] as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)

			const result = await service.listInterviews({ companyId: COMPANY_ID, page: 1, limit: 10 })

			expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({ limitTo: 11 }),
			)
			expect(result.interviews).toHaveLength(1)
			expect(result.pagination.page).toBe(1)
		})

		it('detects hasMore=true when repo returns limit+1 interviews', async () => {
			const interviews = Array.from({ length: 11 }, (_, i) =>
				makeInterview({ id: `interview-${i}` }),
			)
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)

			const result = await service.listInterviews({ companyId: COMPANY_ID, page: 1, limit: 10 })

			expect(result.interviews).toHaveLength(10)
			expect(result.pagination.hasMore).toBe(true)
		})

		it('uses full query + search filter when find param provided', async () => {
			const interviews = [
				makeInterview({ name: 'João Engenheiro', jobName: 'Backend Dev' }),
				makeInterview({ id: 'i2', name: 'Maria Designer', jobName: 'UX Designer' }),
			]
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)

			const result = await service.listInterviews({
				companyId: COMPANY_ID,
				page: 1,
				limit: 10,
				find: 'Engenheiro',
			})

			expect(result.interviews).toHaveLength(1)
			expect(result.interviews[0].name).toBe('João Engenheiro')
		})

		it('handles pagination correctly (page 2)', async () => {
			const interviews = Array.from({ length: 15 }, (_, i) =>
				makeInterview({ id: `interview-${i}`, name: `Candidato ${i}` }),
			)
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(interviews as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)

			const result = await service.listInterviews({ companyId: COMPANY_ID, page: 2, limit: 10 })

			expect(result.interviews).toHaveLength(5)
			expect(result.pagination.total).toBe(15)
			expect(result.pagination.totalPages).toBe(2)
			expect(result.pagination.hasMore).toBe(false)
		})
	})

	describe('getCandidateDetails', () => {
		it('builds jobsApplied from finished company interview refs instead of the limited listJobsApplied query', async () => {
			const finishedInterview = makeInterview({
				date: new Date('2024-04-03T11:00:00.000Z').toISOString(),
				score: '5.41',
			})
			const userData = {
				display_name: 'Henrique Cabral',
				email: 'henrique@example.com',
				phone_number: '+5511999999999',
				photo_url: 'https://example.com/avatar.png',
				interview_tags: [],
			}
			const jobApplied = {
				id: JOB_APPLIED_ID,
				appliedTime: new Date('2024-04-01T10:00:00.000Z').toISOString(),
				companyOwner: null,
				userApplied: null,
				jobApplied: { id: JOB_ID },
				isPracticing: false,
				finished: false,
				finishedTime: null,
				candidateStatus: null,
				batchProcessing: {
					status: 'completed',
					engineBatchId: 'batch-1',
					queuedAt: new Date('2024-04-03T10:00:00.000Z').toISOString(),
					completedAt: new Date('2024-04-03T11:00:00.000Z').toISOString(),
					error: null,
				},
				interview: {
					id: 'interview-result-1',
					dateTime: new Date('2024-04-03T11:00:00.000Z').toISOString(),
					generalFeedback: 'Boa entrevista',
					info: [{ id: 'q1', question: 'Fale sobre você' }],
					additional: [],
					job: 'Engenheiro',
					leveljob: 'Pleno',
					recomentation: 'Prosseguir',
					score: '5.41',
					state: true,
					scom: 6,
					sres: 5,
					stec: 5,
					generalStrengths: ['Comunicação'],
					generalImprovement: ['Detalhar mais experiências'],
					aderencia_descricao: 5,
					alinhamento_responsabilidades: 5,
					requisitos_atendidos: 5,
					alinhamento_nivel: 5,
					gap_para_proximo_nivel: 5,
					estruturacao: 5,
					exemplificacao: 5,
					profundidade: 5,
					nivel_confianca: 5,
					cheat: null,
				},
				whatsappTriagemResult: null,
				exitJobResult: null,
				avaliacaoFinal: null,
			}

			infra.userRepository.getUser.mockResolvedValue(userData as never)
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue(
				[finishedInterview] as never,
			)
			infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)
			infra.jobRepository.getJob.mockResolvedValue({ typeInterview: 'interview' } as never)

			const result = await service.getCandidateDetails({
				userId: USER_ID,
				companyId: COMPANY_ID,
				company: {
					id: COMPANY_ID,
					subscriptionPlan: 'enterprise',
				},
			})

			expect(infra.candidateRepository.listJobsApplied).not.toHaveBeenCalled()
			expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(
				USER_ID,
				JOB_APPLIED_ID,
			)
			expect(result?.candidate.averageScore).toBe(5.41)
			expect(result?.candidate.jobsApplied).toHaveLength(1)
			expect(result?.candidate.jobsApplied[0]).toMatchObject({
				id: JOB_APPLIED_ID,
				companyOwner: COMPANY_ID,
				userApplied: USER_ID,
				jobApplied: JOB_ID,
				finished: true,
				typeInterview: 'interview',
				candidateStatus: 'pending',
				interview: {
					id: 'interview-result-1',
					score: '5.41',
					job: 'Engenheiro',
				},
			})
		})

		it('aggregates company interviews from the same candidate email across multiple user refs', async () => {
			const secondaryUserId = 'user-secondary'
			const secondaryJobAppliedId = 'jobapplied-222'
			const primaryInterview = makeInterview({
				score: '5.41',
			})
			const secondaryInterview = makeInterview({
				id: 'interview-002',
				score: '6.9',
				date: new Date('2024-04-04T11:00:00.000Z').toISOString(),
				user_ref: { id: secondaryUserId, path: `users/${secondaryUserId}` },
				job_applied_ref: {
					id: secondaryJobAppliedId,
					path: `users/${secondaryUserId}/jobsApplied/${secondaryJobAppliedId}`,
				},
			})
			const userData = {
				display_name: 'Henrique Cabral',
				email: 'henrique@example.com',
				phone_number: '+5511999999999',
				photo_url: 'https://example.com/avatar.png',
				interview_tags: [],
			}
			const primaryJobApplied = {
				id: JOB_APPLIED_ID,
				appliedTime: new Date('2024-04-01T10:00:00.000Z').toISOString(),
				companyOwner: { id: COMPANY_ID },
				userApplied: { id: USER_ID },
				jobApplied: { id: JOB_ID },
				finished: true,
				interview: {
					id: 'interview-result-1',
					dateTime: new Date('2024-04-03T11:00:00.000Z').toISOString(),
					score: '5.41',
					job: 'Engenheiro',
					info: [],
					additional: [],
				},
			}
			const secondaryJobApplied = {
				id: secondaryJobAppliedId,
				appliedTime: new Date('2024-04-02T10:00:00.000Z').toISOString(),
				companyOwner: { id: COMPANY_ID },
				userApplied: { id: secondaryUserId },
				jobApplied: { id: 'job-222' },
				finished: true,
				interview: {
					id: 'interview-result-2',
					dateTime: new Date('2024-04-04T11:00:00.000Z').toISOString(),
					score: '6.9',
					job: 'Arquiteto',
					info: [],
					additional: [],
				},
			}

			infra.userRepository.getUser.mockResolvedValue(userData as never)
			infra.candidateRepository.listCompanyInterviews
				.mockResolvedValueOnce([primaryInterview] as never)
				.mockResolvedValueOnce([primaryInterview, secondaryInterview] as never)
			infra.candidateRepository.getJobApplied.mockImplementation(async (candidateUserId, jobAppliedId) => {
				if (candidateUserId === USER_ID && jobAppliedId === JOB_APPLIED_ID) {
					return primaryJobApplied as never
				}

				if (
					candidateUserId === secondaryUserId &&
					jobAppliedId === secondaryJobAppliedId
				) {
					return secondaryJobApplied as never
				}

				return null as never
			})
			infra.jobRepository.getJob.mockImplementation(async (_companyId, jobId) => {
				if (jobId === JOB_ID) return { typeInterview: 'interview' } as never
				if (jobId === 'job-222') return { typeInterview: 'interview' } as never
				return null as never
			})

			const result = await service.getCandidateDetails({
				userId: USER_ID,
				companyId: COMPANY_ID,
				company: {
					id: COMPANY_ID,
					subscriptionPlan: 'enterprise',
				},
			})

			expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(
				secondaryUserId,
				secondaryJobAppliedId,
			)
			expect(result?.candidate.jobsApplied).toHaveLength(2)
			expect(result?.candidate.interviews).toHaveLength(2)
			expect(result?.candidate.jobsApplied.map((job: any) => job.id)).toEqual([
				secondaryJobAppliedId,
				JOB_APPLIED_ID,
			])
		})

		// ─── getCandidateDetails (/companies/user/:id): masking SaaS + Hunting ──
		//
		// Causa raiz: o front cai nesse endpoint quando perde location.state
		// (refresh). Antes, o conteúdo cru vazava (info, vídeo, feedback,
		// interview_tags). A regra correta:
		// - viewer enterprise → tudo visível.
		// - viewer não-enterprise, job da empresa do viewer:
		//   • sem compra e não é 1ª finalizada → nota e conteúdo ocultos.
		//   • sem compra mas é a 1ª finalizada → nota visível, conteúdo oculto.
		//   • com crédito candidate_interview → tudo visível.
		// - viewer não-enterprise, job de OUTRA empresa (defensivo):
		//   • sem compra → nota teaser visível, conteúdo bloqueado por allowlist.
		//   • com crédito → tudo visível.
		// - viewer com subscriptionPlan undefined → tratar como não-enterprise.
		
		it('fills missing interview job metadata from the company interview fallback', async () => {
			const finishedInterview = makeInterview({
				jobName: 'React JS',
				carrerLevel: 'Júnior',
				score: '5.60',
				date: new Date('2026-04-02T11:21:23.728Z').toISOString(),
			})
			const userData = {
				display_name: 'Henrique HML',
				email: 'henrique@example.com',
				phone_number: '+5511999999999',
				photo_url: 'https://example.com/avatar.png',
				interview_tags: [],
			}
			const jobApplied = {
				id: JOB_APPLIED_ID,
				appliedTime: new Date('2026-04-02T11:21:23.728Z').toISOString(),
				companyOwner: { id: COMPANY_ID },
				userApplied: { id: USER_ID },
				jobApplied: { id: JOB_ID },
				finished: true,
				interview: {
					id: 'interview-result-react',
					dateTime: new Date('2026-04-02T19:44:37.210Z').toISOString(),
					score: '5.60',
					job: null,
					leveljob: null,
					info: [],
					additional: [],
				},
			}

			infra.userRepository.getUser.mockResolvedValue(userData as never)
			infra.candidateRepository.listCompanyInterviews
				.mockResolvedValueOnce([finishedInterview] as never)
				.mockResolvedValueOnce([finishedInterview] as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)
			infra.jobRepository.getJob.mockResolvedValue({ typeInterview: 'interview' } as never)

			const result = await service.getCandidateDetails({
				userId: USER_ID,
				companyId: COMPANY_ID,
				company: {
					id: COMPANY_ID,
					subscriptionPlan: 'enterprise',
				},
			})

			expect(result?.candidate.jobsApplied[0]).toMatchObject({
				interview: {
					job: 'React JS',
					leveljob: 'Júnior',
					score: '5.60',
				},
			})
		})
	})

	// ─── updateInterviewStatus ───────────────────────────────────────────────

	describe('updateInterviewStatus', () => {
		it('updates all three locations when interview exists', async () => {
			const interview = makeInterview()
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			const result = await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'approved',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
			})

			expect(infra.candidateRepository.getJobInterview).toHaveBeenCalledWith(COMPANY_ID, JOB_ID, INTERVIEW_ID)
			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID, JOB_ID, INTERVIEW_ID,
				expect.objectContaining({ candidate_status: 'approved' }),
			)
			expect(infra.candidateRepository.updateCompanyInterview).toHaveBeenCalledWith(
				COMPANY_ID, INTERVIEW_ID,
				expect.objectContaining({ candidate_status: 'approved' }),
			)
			expect(result.candidate_status).toBe('approved')
			expect(result.interview_id).toBe(INTERVIEW_ID)
		})

		/**
		 * A regressão que este teste tranca: só o caminho EM MASSA registrava a
		 * mudança de etapa. Mover um card por vez — o que se faz o dia inteiro no
		 * quadro — não deixava rastro, e o histórico do candidato dizia "Nada
		 * registrado ainda" mesmo depois de várias movimentações.
		 */
		it('registra a mudança de etapa no histórico ao mover UM candidato', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'selected',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
				rejectedByUserId: 'user-42',
				actorName: 'Ana Recrutadora',
			})

			// o `void` deixa a gravação pendente quando a função retorna
			await Promise.resolve()

			expect(infra.candidateTimelineRepository.appendEntry).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					jobId: JOB_ID,
					// a MESMA chave que a leitura do histórico usa
					candidateId: INTERVIEW_ID,
					type: 'stage_changed',
					metadata: expect.objectContaining({ to: 'selected', source: 'single' }),
					// quem moveu, gravado junto: o histórico não deve mudar de autor
					// porque a pessoa trocou de nome depois
					authorId: 'user-42',
					authorName: 'Ana Recrutadora',
				}),
			)
		})

		it('sends rejection feedback server-side and persists a valid rejection reason when rejecting an interview', async () => {
			jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00.000Z'))
			const interview = makeInterview()
			infra.candidateRepository.getJobInterview.mockResolvedValue(interview as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
				rejectionReasonCode: 'experiencia_insuficiente',
				rejectionFeedbackMessage: 'Olá {{nomeCandidato}}, obrigado por participar da vaga {{nomeVaga}} na {{nomeDaEmpresa}}.',
				rejectedByUserId: 'recruiter-1',
			})

			expect(rejectionFeedbackEmailClient.sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					from: 'no-reply@coploy.io',
					to: 'ana@example.com',
					subject: 'Retorno sobre seu processo seletivo para Engenheiro na Coploy',
					htmlBody: expect.stringContaining('Engenheiro'),
					textBody: expect.stringContaining('Olá Ana Silva, obrigado por participar da vaga Engenheiro na Coploy.'),
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
					rejectionReasonCode: 'experiencia_insuficiente',
					rejectionReasonLabel: 'Experiência insuficiente',
					rejectionDecisionSource: 'manual',
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
					rejectionReasonCode: 'experiencia_insuficiente',
					rejectionReasonLabel: 'Experiência insuficiente',
					rejectionDecisionSource: 'manual',
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
						rejectionReasonCode: 'experiencia_insuficiente',
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

		it('rejects missing rejection reason for kanban rejection', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})

		it('rejects a new rejection without feedback message', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'experiencia_insuficiente',
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})

		it('blocks sensitive free-text feedback before sending or persisting rejection', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'experiencia_insuficiente',
					rejectionFeedbackMessage: 'Não seguiremos porque sua idade não se enquadra no perfil.',
				}),
			).rejects.toThrow('termo sensível "idade"')

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('blocks protected terms in internal rejectionNote before sending or persisting rejection', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'outro',
					rejectionNote: 'A candidata está grávida e não poderia assumir agora.',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow('nota interna de reprovação contém o termo sensível "grávida"')

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('allows legitimate internal rejectionNote anchored in job requirements without flags', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
				rejectionReasonCode: 'outro',
				rejectionNote: 'A vaga exige CNH categoria B ativa; a candidatura indicou CNH categoria A.',
				rejectionFeedbackMessage: 'Mensagem de feedback',
			})

			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				INTERVIEW_ID,
				expect.objectContaining({
					rejectionNote: 'A vaga exige CNH categoria B ativa; a candidatura indicou CNH categoria A.',
					rejectionRiskFlags: null,
				}),
			)
		})

		it('does not allow legacy rejection_email_sent_at alone to reject silently', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'experiencia_insuficiente',
					rejectionEmailSentAt: '2026-08-12T10:00:00.000Z',
				}),
			).rejects.toThrow(BadRequestError)

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})

		it('does not persist the rejection when server-side feedback email fails', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)
			rejectionFeedbackEmailClient.sendEmail.mockRejectedValue(new Error('postmark down'))

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'experiencia_insuficiente',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow('postmark down')

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		})

		it('rejects invalid rejection reason code', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(makeInterview() as never)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'Rejected',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
					rejectionReasonCode: 'codigo_invalido',
					rejectionFeedbackMessage: 'Mensagem de feedback',
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})

		it('accepts but ignores legacy feedback timestamp updates for already rejected interviews', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(
				makeInterview({
					candidateStatus: 'Rejected',
					rejectionReasonCode: 'perfil_nao_aderente',
					rejectionReasonLabel: 'Perfil não aderente',
				}) as never,
			)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
				rejectionEmailSentAt: '2026-08-12T10:00:00.000Z',
			})

			expect(rejectionFeedbackEmailClient.sendEmail).not.toHaveBeenCalled()
			expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
				USER_ID,
				JOB_APPLIED_ID,
				expect.not.objectContaining({
					rejectionFeedbackSentAt: expect.any(Date),
				}),
			)
			expect(infra.outboxRepository.insert).not.toHaveBeenCalledWith(
				expect.objectContaining({ type: 'feedback_enviado' }),
			)
		})

		it('does not require reason or feedback when re-saving a legacy already rejected interview', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(
				makeInterview({
					candidateStatus: 'Rejected',
					rejectionReasonCode: null,
					rejectionReasonLabel: null,
					rejectionFeedbackSentAt: null,
				}) as never,
			)
			infra.candidateRepository.updateJobInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateCompanyInterview.mockResolvedValue(undefined)
			infra.candidateRepository.updateJobApplied.mockResolvedValue(undefined)

			await service.updateInterviewStatus({
				interviewId: INTERVIEW_ID,
				candidateStatus: 'Rejected',
				postJobId: JOB_ID,
				companyId: COMPANY_ID,
			})

			expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				INTERVIEW_ID,
				expect.objectContaining({ candidate_status: 'Rejected' }),
			)
			expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
		})

		it('throws BadRequestError when interview not found', async () => {
			infra.candidateRepository.getJobInterview.mockResolvedValue(null)

			await expect(
				service.updateInterviewStatus({
					interviewId: INTERVIEW_ID,
					candidateStatus: 'approved',
					postJobId: JOB_ID,
					companyId: COMPANY_ID,
				}),
			).rejects.toThrow(BadRequestError)

			expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		})
	})

	// ─── toggleCandidateLike ─────────────────────────────────────────────────

	describe('toggleCandidateLike', () => {
		const mockJobApplied = {
			id: JOB_APPLIED_ID,
			userId: USER_ID,
			jobApplied: { id: JOB_ID },
		}

		it('throws BadRequestError when job application not found', async () => {
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)

			await expect(
				service.toggleCandidateLike({
					userId: USER_ID,
					jobAppliedId: JOB_APPLIED_ID,
					action: 'like',
					currentUserId: 'recruiter-01',
					companyId: COMPANY_ID,
					currentUser: null,
				}),
			).rejects.toThrow(BadRequestError)
		})

		// ─── getPublicCandidateDetails (hunting): masking de conteúdo ──────────
		//
		// Regra (matriz):
		// - viewer SaaS não-enterprise, candidato de outra empresa, sem compra
		//   → conteúdo bloqueado (interview shell, sem feedback/vídeo/análise),
		//     exitJobResult + whatsappTriagemResult zerados.
		// - viewer comprou (crédito candidate_interview daquela entrevista)
		//   → tudo visível.
		// - viewer anônimo (company null) → mesmo bloqueio do não-comprado.
		
		it('creates a new like when no existing like from current user', async () => {
			infra.candidateRepository.getJobApplied.mockResolvedValue(mockJobApplied as never)
			infra.candidateRepository.listCandidateLikes.mockResolvedValue([])
			infra.candidateRepository.createCandidateLike.mockResolvedValue({ id: 'like-1' } as never)
			infra.candidateRepository.listJobInterviews.mockResolvedValue([])

			const result = await service.toggleCandidateLike({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				action: 'like',
				currentUserId: 'recruiter-01',
				companyId: COMPANY_ID,
				currentUser: null,
			})

			expect(infra.candidateRepository.createCandidateLike).toHaveBeenCalled()
			expect(result.liked).toBe(true)
		})
	})
})
