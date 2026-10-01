jest.mock('@/env', () => ({
	env: {
		INTERVIEW_BASE_URL: 'https://interview.example.com',
	},
}))

jest.mock('../interviews-service', () => ({
	createInterviewsService: jest.fn(() => ({
		updateInterviewStatus: jest.fn(),
	})),
}))

jest.mock('../jobs-service', () => ({
	createJobsService: jest.fn(),
}))

import { createHiringManagerReviewService } from '../hm-review-service'
import { createInterviewsService } from '../interviews-service'
import { createJobsService } from '../jobs-service'
import { createMockInfra } from './mock-infra'

function infraWithHmReview() {
	const infra = createMockInfra()
	;(infra as unknown as { hmReviewTokenRepository: unknown }).hmReviewTokenRepository = {
		createReviewToken: jest.fn().mockResolvedValue(undefined),
		consumeReviewToken: jest.fn(),
		getByAccessCode: jest.fn(),
	}
	return infra as ReturnType<typeof createMockInfra> & {
		hmReviewTokenRepository: {
			createReviewToken: jest.Mock
			consumeReviewToken: jest.Mock
			getByAccessCode: jest.Mock
		}
	}
}

describe('hm-review-service', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('issue', () => {
		it('emite convite opaco escopado à vaga e shortlist', async () => {
			const infra = infraWithHmReview()
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Eng' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{ id: 'ja-1', job_applied_ref: { id: 'ja-1' }, finished: true },
					{ id: 'ja-2', job_applied_ref: { id: 'ja-2' }, finished: true },
				]),
			})
			const service = createHiringManagerReviewService(infra)

			const result = await service.issue({
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1', 'ja-2'],
				createdByUserId: 'recruiter-1',
			})

			expect(result.code.length).toBeGreaterThanOrEqual(40)
			expect(result.url).toContain(`/hm-review/${result.code}`)
			expect(infra.hmReviewTokenRepository.createReviewToken).toHaveBeenCalledWith(
				result.code,
				expect.objectContaining({
					companyId: 'co-1',
					jobId: 'job-1',
					jobAppliedIds: ['ja-1', 'ja-2'],
					createdByUserId: 'recruiter-1',
				}),
			)
		})

		it('recusa jobAppliedId fora da vaga (não vaza escopo)', async () => {
			const infra = infraWithHmReview()
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Eng' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{ id: 'ja-1', job_applied_ref: { id: 'ja-1' }, finished: true },
				]),
			})
			const service = createHiringManagerReviewService(infra)

			await expect(
				service.issue({
					companyId: 'co-1',
					jobId: 'job-1',
					jobAppliedIds: ['ja-1', 'other-company-ja'],
					createdByUserId: 'recruiter-1',
				}),
			).rejects.toThrow(/out of scope/i)
			expect(infra.hmReviewTokenRepository.createReviewToken).not.toHaveBeenCalled()
		})
	})

	describe('redeem', () => {
		it('troca convite válido por accessToken', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.consumeReviewToken.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
				accessExpiresAt: new Date(Date.now() + 60_000),
			})
			const service = createHiringManagerReviewService(infra)

			const result = await service.redeem('invite-code-high-entropy-abcdefgh')
			expect(result.accessToken.length).toBeGreaterThanOrEqual(40)
			expect(result.companyId).toBe('co-1')
			expect(infra.hmReviewTokenRepository.consumeReviewToken).toHaveBeenCalled()
		})

		it('barra replay com a mesma mensagem genérica', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.consumeReviewToken.mockResolvedValue(null)
			const service = createHiringManagerReviewService(infra)

			const first = await service.redeem('a'.repeat(24)).catch((e: Error) => e.message)
			const second = await service.redeem('b'.repeat(24)).catch((e: Error) => e.message)
			expect(first).toBe(second)
			expect(first).toMatch(/invalid or expired/i)
		})
	})

	describe('getShortlist', () => {
		it('lista só candidatos do escopo do token', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Eng', identifier: 'E1' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{
						id: 'ja-1',
						job_applied_ref: { id: 'ja-1' },
						user_ref: { id: 'user-1' },
						name: 'Ana',
						photo_url: null,
						score: '8.2',
						candidate_status: 'Pending',
						date: new Date('2026-08-01T00:00:00.000Z'),
					},
					{
						id: 'ja-2',
						job_applied_ref: { id: 'ja-2' },
						user_ref: { id: 'user-2' },
						name: 'Outro',
						score: '9',
						candidate_status: 'Pending',
						date: new Date('2026-08-01T00:00:00.000Z'),
					},
				]),
				getJobApplied: jest.fn().mockResolvedValue(null),
			})
			const service = createHiringManagerReviewService(infra)

			const shortlist = await service.getShortlist('access-token')
			expect(shortlist.candidates).toHaveLength(1)
			expect(shortlist.candidates[0]?.jobAppliedId).toBe('ja-1')
			expect(shortlist.candidates[0]?.suggestedAction).toBe('approve')
			expect(shortlist.candidates[0]?.summary).toBeNull()
			expect(shortlist.candidates[0]?.strengths).toEqual([])
			expect(shortlist.candidates[0]?.toDevelop).toEqual([])
			expect(shortlist.candidates[0]?.competencies).toEqual([])
			expect(shortlist.candidates[0]?.questions).toEqual([])
			expect(shortlist.rejectionReasons.length).toBeGreaterThan(0)
		})

		it('enriquece shortlist com detalhe curado do JobApplied (TOS-031)', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			const getJobApplied = jest.fn().mockResolvedValue({
				id: 'ja-1',
				interview: {
					generalFeedback: 'Boa comunicação',
					generalStrengths: ['Clareza', 'Exemplos'],
					generalImprovement: ['Spring Boot'], // NÃO deve ir em toDevelop
					recomentation: 'Análise interna',
					info: [
						{
							question: 'Conte um desafio',
							video: 'https://cdn.example/q1.mp4',
							score: 8,
							qRecomendation: 'Resposta estruturada',
							analyze: 'texto IA cru',
							score_detalhado: {
								competencias_criticas: [{ competencia: 'Liderança', score: 0.7 }],
								competencias_adicionais: [{ competencia: 'Hobby', score: 0.9 }],
							},
						},
					],
					additional: [{ question: 'Extra', video: 'https://cdn.example/extra.mp4', score: 7 }],
				},
				avaliacaoFinal: {
					recomendacoes: {
						pontos_fortes: ['Fallback forte'],
						areas_desenvolvimento: ['Delegação'],
						sugestoes_melhoria: ['Ignorado se areas existir'],
					},
				},
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Eng' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{
						id: 'ja-1',
						job_applied_ref: { id: 'ja-1' },
						user_ref: { id: 'user-1' },
						name: 'Ana',
						score: '8.2',
						candidate_status: 'Pending',
						date: new Date('2026-08-01T00:00:00.000Z'),
					},
				]),
				getJobApplied,
			})
			const service = createHiringManagerReviewService(infra)

			const shortlist = await service.getShortlist('access-token')
			const candidate = shortlist.candidates[0]
			expect(getJobApplied).toHaveBeenCalledWith('user-1', 'ja-1')
			expect(candidate?.summary).toBe('Boa comunicação')
			expect(candidate?.strengths).toEqual(['Clareza', 'Exemplos'])
			expect(candidate?.toDevelop).toEqual(['Delegação'])
			expect(candidate?.toDevelop).not.toContain('Spring Boot')
			expect(candidate?.competencies).toEqual([{ label: 'Liderança', score: 7 }])
			expect(candidate?.competencies.some((c) => c.label === 'Hobby')).toBe(false)
			expect(candidate?.questions).toHaveLength(2)
			expect(candidate?.questions[0]).toMatchObject({
				question: 'Conte um desafio',
				videoUrl: null, // prévia no topo; não duplica na lista
				score: 8,
				feedback: 'Resposta estruturada',
			})
			expect(candidate?.questions[1]).toMatchObject({
				question: 'Extra',
				videoUrl: 'https://cdn.example/extra.mp4',
			})
			expect(candidate?.videoUrl).toBe('https://cdn.example/q1.mp4')
			expect(JSON.stringify(candidate)).not.toMatch(/texto IA cru/)
		})

		it('normaliza competências na escala maxScore (0..10/n) como o dashboard', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			// 5 perguntas → maxScore = 2; score 1.7 na escala da pergunta deve virar ~9/10
			// (antes: convertCompetencyScore(1.7) = 2 → barras vazias com nota geral 7+)
			const info = Array.from({ length: 5 }, (_, i) => ({
				question: `Pergunta ${i + 1}`,
				video: i === 0 ? 'https://cdn.example/preview.mp4' : `https://cdn.example/q${i + 1}.mp4`,
				score: 1.5,
				score_detalhado: {
					competencias_criticas: [{ competencia: 'Product Design', score: 1.7 }],
				},
			}))
			const getJobApplied = jest.fn().mockResolvedValue({
				id: 'ja-1',
				interview: { info },
				avaliacaoFinal: null,
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Product Design' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{
						id: 'ja-1',
						job_applied_ref: { id: 'ja-1' },
						user_ref: { id: 'user-1' },
						name: 'Vitor',
						score: '7.7',
						candidate_status: 'Pending',
						date: new Date('2026-08-01T00:00:00.000Z'),
					},
				]),
				getJobApplied,
			})
			const service = createHiringManagerReviewService(infra)

			const shortlist = await service.getShortlist('access-token')
			const candidate = shortlist.candidates[0]
			expect(candidate?.score).toBe(7.7)
			expect(candidate?.competencies).toEqual([{ label: 'Product Design', score: 9 }])
			expect(candidate?.videoUrl).toBe('https://cdn.example/preview.mp4')
			expect(candidate?.questions[0]?.videoUrl).toBeNull()
			expect(candidate?.questions.filter((q) => q.videoUrl === candidate?.videoUrl)).toHaveLength(0)
		})

		it('prefere pontuacao 0–10 do avaliacaoFinal quando score legado está na escala curta', async () => {
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			const getJobApplied = jest.fn().mockResolvedValue({
				id: 'ja-1',
				interview: { info: [] },
				avaliacaoFinal: {
					competencias_criticas: [
						{ nome: 'UX Research', score: 2, pontuacao: 8 },
						{ nome: 'Visual Design', score: 1, pontuacao: 7 },
					],
				},
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn().mockResolvedValue({ id: 'job-1', jobName: 'Product Design' }),
				listJobInterviews: jest.fn().mockResolvedValue([
					{
						id: 'ja-1',
						job_applied_ref: { id: 'ja-1' },
						user_ref: { id: 'user-1' },
						name: 'Vitor',
						score: '7.7',
						candidate_status: 'Pending',
						date: new Date('2026-08-01T00:00:00.000Z'),
					},
				]),
				getJobApplied,
			})
			const service = createHiringManagerReviewService(infra)

			const shortlist = await service.getShortlist('access-token')
			expect(shortlist.candidates[0]?.competencies).toEqual([
				{ label: 'UX Research', score: 8 },
				{ label: 'Visual Design', score: 7 },
			])
		})
	})

	describe('submitDecision', () => {
		it('aprova via interviews-service existente', async () => {
			const updateInterviewStatus = jest.fn().mockResolvedValue({
				message: 'ok',
				interview_id: 'ja-1',
				candidate_status: 'Approved',
			})
			;(createInterviewsService as jest.Mock).mockReturnValue({ updateInterviewStatus })
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
				createdByUserId: 'recruiter-1',
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				getJob: jest.fn(),
				listJobInterviews: jest.fn().mockResolvedValue([
					{ id: 'ja-1', job_applied_ref: { id: 'ja-1' } },
				]),
			})
			const service = createHiringManagerReviewService(infra)

			await service.submitDecision({
				accessToken: 'access',
				jobAppliedId: 'ja-1',
				action: 'approve',
			})

			expect(updateInterviewStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					interviewId: 'ja-1',
					candidateStatus: 'Approved',
					companyId: 'co-1',
					postJobId: 'job-1',
					rejectedByUserId: 'recruiter-1',
				}),
			)
		})

		it('exige motivo+feedback ao reprovar (TOS-025)', async () => {
			const updateInterviewStatus = jest.fn()
			;(createInterviewsService as jest.Mock).mockReturnValue({ updateInterviewStatus })
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			;(createJobsService as jest.Mock).mockReturnValue({
				listJobInterviews: jest.fn().mockResolvedValue([
					{ id: 'ja-1', job_applied_ref: { id: 'ja-1' } },
				]),
			})
			const service = createHiringManagerReviewService(infra)

			await expect(
				service.submitDecision({
					accessToken: 'access',
					jobAppliedId: 'ja-1',
					action: 'reject',
				}),
			).rejects.toThrow(/rejectionReasonCode/i)

			await expect(
				service.submitDecision({
					accessToken: 'access',
					jobAppliedId: 'ja-1',
					action: 'reject',
					rejectionReasonCode: 'experiencia_insuficiente',
				}),
			).rejects.toThrow(/rejectionFeedbackMessage/i)

			expect(updateInterviewStatus).not.toHaveBeenCalled()
		})

		it('bloqueia decisão fora do escopo do token', async () => {
			const updateInterviewStatus = jest.fn()
			;(createInterviewsService as jest.Mock).mockReturnValue({ updateInterviewStatus })
			const infra = infraWithHmReview()
			infra.hmReviewTokenRepository.getByAccessCode.mockResolvedValue({
				id: 'invite',
				companyId: 'co-1',
				jobId: 'job-1',
				jobAppliedIds: ['ja-1'],
			})
			const service = createHiringManagerReviewService(infra)

			await expect(
				service.submitDecision({
					accessToken: 'access',
					jobAppliedId: 'other-ja',
					action: 'approve',
				}),
			).rejects.toThrow(/outside this review token scope/i)
			expect(updateInterviewStatus).not.toHaveBeenCalled()
		})
	})
})
