import { createInterviewsService } from '../interviews-service'
import { createMockInfra } from './mock-infra'

// env vars provided by jest.setup.ts

describe('createInterviewsService — language evaluation fields', () => {
	const COMPANY_ID = 'company-123'
	const USER_ID = 'user-abc'
	const JOB_ID = 'job-xyz'
	const JOB_APPLIED_ID = 'jobapplied-999'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createInterviewsService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createInterviewsService(infra)
	})

	// Scenario 4: getCandidateDetails exposes evaluateLanguage + languageEvaluation
	describe('getCandidateDetails', () => {
		const userData = {
			display_name: 'Ana Silva',
			email: 'ana@example.com',
			phone_number: null,
			photo_url: null,
			interview_tags: [],
		}

		const finishedInterview = {
			id: 'interview-1',
			companyId: COMPANY_ID,
			finished: true,
			date: new Date('2024-04-03').toISOString(),
			dateSelect: null,
			name: 'Ana Silva',
			user_ref: { id: USER_ID, path: `users/${USER_ID}` },
			job_applied_ref: {
				id: JOB_APPLIED_ID,
				path: `users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			},
			job_ref: { id: JOB_ID },
			candidateStatus: 'Pending',
		}

		function makeJobApplied(overrides: Record<string, unknown> = {}) {
			return {
				id: JOB_APPLIED_ID,
				appliedTime: new Date('2024-04-01').toISOString(),
				companyOwner: null,
				userApplied: null,
				jobApplied: { id: JOB_ID },
				isPracticing: false,
				finished: true,
				finishedTime: new Date('2024-04-03').toISOString(),
				candidateStatus: 'Pending',
				batchProcessing: null,
				avaliacaoFinal: null,
				exitJobResult: null,
				whatsappTriagemResult: null,
				interview: {
					id: 'int-1',
					dateTime: null,
					generalFeedback: 'Bom candidato',
					info: [
						{
							id: 'q1',
							question: 'Q1',
							answer: 'A1',
							score: 8,
							languageScore: 7.5,
							languageFeedback: 'Boa fluência',
							languageAnalise: 'Nível B2',
						},
					],
					additional: [],
					job: 'Dev Backend',
					leveljob: 'Pleno',
					recomentation: null,
					score: '8.00',
					state: true,
					scom: 8,
					sres: 8,
					stec: 8,
					generalStrengths: null,
					generalImprovement: null,
					aderencia_descricao: 8,
					alinhamento_responsabilidades: 8,
					requisitos_atendidos: 8,
					alinhamento_nivel: 8,
					gap_para_proximo_nivel: 8,
					estruturacao: 8,
					exemplificacao: 8,
					profundidade: 8,
					nivel_confianca: 8,
					cheat: null,
				},
				...overrides,
			}
		}

		it('exposes evaluateLanguage=true and languageEvaluation when the job flag is set and analysis ran', async () => {
			infra.userRepository.getUser.mockResolvedValue(userData as never)
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([finishedInterview] as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(
				makeJobApplied({
					languageEvaluation: {
						score: 7.8,
						nivel: 'B2',
						feedback: 'Fluência consolidada',
						analise: 'Avaliação de idioma',
					},
				}) as never,
			)
			infra.jobRepository.getJob.mockResolvedValue({
				typeInterview: 'interview',
				evaluateLanguage: true,
			} as never)

			const result = await service.getCandidateDetails({
				userId: USER_ID,
				companyId: COMPANY_ID,
				company: { id: COMPANY_ID, subscriptionPlan: 'enterprise' },
			})

			const job = result?.candidate.jobsApplied[0] as Record<string, unknown>

			expect(job.evaluateLanguage).toBe(true)
			expect(job.languageEvaluation).toEqual({
				score: 7.8,
				nivel: 'B2',
				feedback: 'Fluência consolidada',
				analise: 'Avaliação de idioma',
			})

			// Per-question language fields normalized: number preserved, strings non-null
			const info = (job.interview as Record<string, unknown>).info as Record<string, unknown>[]
			expect(info[0].languageScore).toBe(7.5)
			expect(info[0].languageFeedback).toBe('Boa fluência')
			expect(info[0].languageAnalise).toBe('Nível B2')
		})

		it('exposes evaluateLanguage=false and languageEvaluation=null when flag is absent', async () => {
			infra.userRepository.getUser.mockResolvedValue(userData as never)
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([finishedInterview] as never)
			infra.candidateRepository.getJobApplied.mockResolvedValue(
				makeJobApplied({ languageEvaluation: null }) as never,
			)
			infra.jobRepository.getJob.mockResolvedValue({
				typeInterview: 'interview',
				evaluateLanguage: false,
			} as never)

			const result = await service.getCandidateDetails({
				userId: USER_ID,
				companyId: COMPANY_ID,
				company: { id: COMPANY_ID, subscriptionPlan: 'enterprise' },
			})

			const job = result?.candidate.jobsApplied[0] as Record<string, unknown>
			expect(job.evaluateLanguage).toBe(false)
			expect(job.languageEvaluation).toBeNull()
		})
	})

	// Scenario 5: getPublicCandidateDetails masks languageEvaluation for non-enterprise viewer
	})
