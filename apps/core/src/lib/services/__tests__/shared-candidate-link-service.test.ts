jest.mock('nanoid', () => ({ nanoid: () => 'test-code-1234567' }))

import {
	createSharedCandidateLinkService,
	stripInterviewDetail,
	stripListCandidate,
} from '../shared-candidate-link-service'
import { createMockInfra } from './mock-infra'

describe('createSharedCandidateLinkService — createShareLink', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createSharedCandidateLinkService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createSharedCandidateLinkService(infra)
	})

	it('forces sections.questions = true even when caller sends false', async () => {
		;(infra.jobRepository.getJob as jest.Mock).mockResolvedValue({
			id: 'job-1',
			companyId: 'company-1',
		})
		;(infra.sharedCandidateLinkRepository.create as jest.Mock).mockImplementation(
			async (data) => ({ ...data, id: data.code }),
		)

		await service.createShareLink(
			'company-1',
			'job-1',
			{
				candidateIds: ['user-1'],
				sections: { score: false, feedback: false, analysis: false, questions: false },
			},
			'creator-1',
		)

		expect(infra.sharedCandidateLinkRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				sections: { score: false, feedback: false, analysis: false, questions: true },
			}),
		)
	})

	it('rejects a job that does not belong to the company', async () => {
		;(infra.jobRepository.getJob as jest.Mock).mockResolvedValue(null)

		await expect(
			service.createShareLink(
				'company-1',
				'job-from-other-company',
				{
					candidateIds: ['user-1'],
					sections: { score: true, feedback: true, analysis: true, questions: true },
				},
				'creator-1',
			),
		).rejects.toThrow('Job not found')

		expect(infra.sharedCandidateLinkRepository.create).not.toHaveBeenCalled()
	})
})

describe('createSharedCandidateLinkService — resolveShareLink', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createSharedCandidateLinkService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createSharedCandidateLinkService(infra)
	})

	it('rejects when the code does not exist', async () => {
		;(infra.sharedCandidateLinkRepository.getByCode as jest.Mock).mockResolvedValue(null)

		await expect(service.resolveShareLink('missing-code')).rejects.toThrow(
			'Share link inválido',
		)
	})

	it('rejects when the link is revoked', async () => {
		;(infra.sharedCandidateLinkRepository.getByCode as jest.Mock).mockResolvedValue({
			id: 'code-1',
			code: 'code-1',
			companyId: 'company-1',
			jobId: 'job-1',
			candidateIds: ['user-1'],
			sections: { score: true, feedback: true, analysis: true, questions: true },
			revoked: true,
		})

		await expect(service.resolveShareLink('code-1')).rejects.toThrow('Share link inválido')
	})

	it('returns the record when valid and not revoked', async () => {
		const record = {
			id: 'code-1',
			code: 'code-1',
			companyId: 'company-1',
			jobId: 'job-1',
			candidateIds: ['user-1'],
			sections: { score: true, feedback: true, analysis: true, questions: true },
			revoked: false,
		}
		;(infra.sharedCandidateLinkRepository.getByCode as jest.Mock).mockResolvedValue(record)

		await expect(service.resolveShareLink('code-1')).resolves.toEqual(record)
	})

	it('rejects when the link has expired', async () => {
		;(infra.sharedCandidateLinkRepository.getByCode as jest.Mock).mockResolvedValue({
			id: 'code-1',
			code: 'code-1',
			companyId: 'company-1',
			jobId: 'job-1',
			candidateIds: ['user-1'],
			sections: { score: true, feedback: true, analysis: true, questions: true },
			revoked: false,
			expiresAt: new Date(Date.now() - 1000 * 60),
		})

		await expect(service.resolveShareLink('code-1')).rejects.toThrow('Share link inválido')
	})

	it('accepts a link with a future expiresAt', async () => {
		const record = {
			id: 'code-1',
			code: 'code-1',
			companyId: 'company-1',
			jobId: 'job-1',
			candidateIds: ['user-1'],
			sections: { score: true, feedback: true, analysis: true, questions: true },
			revoked: false,
			expiresAt: new Date(Date.now() + 1000 * 60 * 60),
		}
		;(infra.sharedCandidateLinkRepository.getByCode as jest.Mock).mockResolvedValue(record)

		await expect(service.resolveShareLink('code-1')).resolves.toEqual(record)
	})
})

describe('stripListCandidate', () => {
	it('keeps score when the score section is liberated', () => {
		const candidate = { id: 'c1', score: 8.5 }
		const result = stripListCandidate(candidate, {
			score: true,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result.score).toBe(8.5)
	})

	it('nulls score when the score section is hidden', () => {
		const candidate = { id: 'c1', score: 8.5 }
		const result = stripListCandidate(candidate, {
			score: false,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result.score).toBeNull()
	})

	it('never leaks unknown/unlisted fields, even with all sections liberated', () => {
		const candidate = {
			id: 'c1',
			score: 8.5,
			name: 'Fulano',
			interview: { generalFeedback: 'não devia vazar na lista' },
			avaliacaoFinal: { generalFeedback: 'não devia vazar na lista' },
			someBrandNewAnalyticField: 'segredo',
			rejectionNote: 'nota interna sigilosa',
		}
		const result = stripListCandidate(candidate, {
			score: true,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result.interview).toBeUndefined()
		expect(result.avaliacaoFinal).toBeUndefined()
		expect(result.someBrandNewAnalyticField).toBeUndefined()
		expect(result.rejectionNote).toBeUndefined()
	})

	it('only returns the allowlisted identity/meta fields used by the frontend', () => {
		const candidate = {
			id: 'c1',
			user_ref: 'user-1',
			job_applied_ref: 'ja-1',
			name: 'Fulano',
			photo_url: 'http://x',
			email: 'a@b.com',
			phone_number: '123',
			date: '2026-01-01',
			candidate_status: 'pending',
			finished: true,
			likes: [{ id: 'l1' }],
			totalLikes: 1,
			totalDislikes: 0,
			score: 8.5,
		}
		const result = stripListCandidate(candidate, {
			score: true,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result).toEqual(candidate)
	})
})

describe('stripInterviewDetail', () => {
	function buildResult() {
		return {
			jobApplied: {
				id: 'ja-1',
				interview: {
					score: 8,
					generalFeedback: 'ótimo candidato',
					recomentation: 'contratar',
					cheat: { resumo_executivo: {} },
					analise_por_resposta: [{ q: 1 }],
					competenciasCriticas: ['comm'],
					info: [
						{
							question: 'pergunta 1',
							video: 'url',
							captionSegments: [{ start: 0, end: 2, text: 'oi' }],
							score: 9,
							feedback: 'bom',
							strengths: ['x'],
							improvement: ['y'],
						},
					],
				},
			},
		}
	}

	it('keeps everything when all sections are liberated', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: true,
			feedback: true,
			analysis: true,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		expect(interview.score).toBe(8)
		expect(interview.generalFeedback).toBe('ótimo candidato')
		expect(interview.cheat).toEqual({ resumo_executivo: {} })
		const info = interview.info as Record<string, unknown>[]
		expect(info[0].score).toBe(9)
		expect(info[0].feedback).toBe('bom')
	})

	/*
	 * O gestor recebe o vídeo; a legenda vinha vazia porque `captionSegments` não
	 * estava na allowlist e era descartada aqui. Ela acompanha o vídeo em
	 * QUALQUER combinação de seções — é o que a pessoa disse, igual a `answer`.
	 */
	it('mantém a legenda mesmo com todas as seções escondidas', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: false,
			feedback: false,
			analysis: false,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		const info = interview.info as Record<string, unknown>[]
		expect(info[0].captionSegments).toEqual([{ start: 0, end: 2, text: 'oi' }])
		expect(info[0].video).toBe('url')
		expect(info[0].score).toBeUndefined()
	})

	it('nulls score fields when score section is hidden', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: false,
			feedback: true,
			analysis: true,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		expect(interview.score).toBeNull()
		const info = interview.info as Record<string, unknown>[]
		expect(info[0].score).toBeUndefined()
	})

	it('removes feedback fields when feedback section is hidden', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: true,
			feedback: false,
			analysis: true,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		expect(interview.generalFeedback).toBeNull()
		expect(interview.recomentation).toBeNull()
		const info = interview.info as Record<string, unknown>[]
		expect(info[0].feedback).toBeUndefined()
		expect(info[0].strengths).toBeUndefined()
		expect(info[0].improvement).toBeUndefined()
	})

	it('removes analysis/cheat fields when analysis section is hidden', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: true,
			feedback: true,
			analysis: false,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		expect(interview.cheat).toBeNull()
		expect(interview.analise_por_resposta).toBeUndefined()
		expect(interview.competenciasCriticas).toBeUndefined()
	})

	it('keeps question text and video regardless of other sections', () => {
		const result = stripInterviewDetail(buildResult(), {
			score: false,
			feedback: false,
			analysis: false,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		const info = interview.info as Record<string, unknown>[]
		expect(info[0].question).toBe('pergunta 1')
		expect(info[0].video).toBe('url')
	})

	it('never leaks an unknown analytic field injected on the source, even with analysis off', () => {
		const source = buildResult()
		;(source.jobApplied.interview as Record<string, unknown>).someBrandNewAnalyticField =
			'segredo-que-nao-devia-vazar'
		;(source.jobApplied.interview.info[0] as Record<string, unknown>).someBrandNewInfoField =
			'segredo-que-nao-devia-vazar'
		;(source.jobApplied as Record<string, unknown>).someBrandNewTopLevelField =
			'segredo-que-nao-devia-vazar'

		const result = stripInterviewDetail(source, {
			score: true,
			feedback: true,
			analysis: false,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		const info = interview.info as Record<string, unknown>[]

		expect(interview.someBrandNewAnalyticField).toBeUndefined()
		expect(info[0].someBrandNewInfoField).toBeUndefined()
		expect(result.jobApplied.someBrandNewTopLevelField).toBeUndefined()
	})

	function buildTopLevelResult() {
		return {
			jobApplied: {
				id: 'ja-1',
				appliedTime: '2026-01-01',
				finishedTime: '2026-01-02',
				score: 8,
				scom: 1,
				sres: 2,
				stec: 3,
				recomentation: 'contratar',
				rejectionNote: 'nota interna sigilosa',
				nivel_confianca: 0.9,
				profundidade: 0.8,
				requisitos_atendidos: 5,
				avaliacaoFinal: {
					score: 9,
					pontuacao_final: 90,
					generalFeedback: 'ótimo',
					generalRecomendation: 'contratar',
					competencias_criticas: [{ nome: 'comm' }],
					nivel: 'senior',
				},
				whatsappTriagemResult: {
					masked: false,
					feedback_geral: 'texto sensível',
					recomendacao_recrutador: 'contratar',
					porcentagem_match: 80,
					requisitos_atendidos: ['a'],
					requisitos_nao_atendidos: ['b'],
					pontos_atencao: ['c'],
				},
				exitJobResult: {
					masked: false,
					executive_summary: 'texto sensível',
					resignation_reasons: ['x'],
					mapped_emotions: ['y'],
					reasons_over_time: ['z'],
				},
				interview: null,
			},
		}
	}

	it('hides top-level score fields when the score section is off', () => {
		const result = stripInterviewDetail(buildTopLevelResult(), {
			score: false,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result.jobApplied.score).toBeUndefined()
		expect(result.jobApplied.scom).toBeUndefined()
		expect(result.jobApplied.sres).toBeUndefined()
		expect(result.jobApplied.stec).toBeUndefined()
		const avaliacaoFinal = result.jobApplied.avaliacaoFinal as Record<string, unknown>
		expect(avaliacaoFinal.score).toBeUndefined()
		expect(avaliacaoFinal.pontuacao_final).toBeUndefined()
	})

	it('hides top-level feedback fields when the feedback section is off', () => {
		const result = stripInterviewDetail(buildTopLevelResult(), {
			score: true,
			feedback: false,
			analysis: true,
			questions: true,
		})
		expect(result.jobApplied.recomentation).toBeUndefined()
		const avaliacaoFinal = result.jobApplied.avaliacaoFinal as Record<string, unknown>
		expect(avaliacaoFinal.generalFeedback).toBeUndefined()
		expect(avaliacaoFinal.generalRecomendation).toBeUndefined()
		const whatsapp = result.jobApplied.whatsappTriagemResult as Record<string, unknown>
		expect(whatsapp.feedback_geral).toBeUndefined()
		expect(whatsapp.recomendacao_recrutador).toBeUndefined()
		const exitJob = result.jobApplied.exitJobResult as Record<string, unknown>
		expect(exitJob.executive_summary).toBeUndefined()
		expect(exitJob.resignation_reasons).toBeUndefined()
	})

	it('hides top-level analysis fields when the analysis section is off', () => {
		const result = stripInterviewDetail(buildTopLevelResult(), {
			score: true,
			feedback: true,
			analysis: false,
			questions: true,
		})
		expect(result.jobApplied.nivel_confianca).toBeUndefined()
		expect(result.jobApplied.profundidade).toBeUndefined()
		expect(result.jobApplied.requisitos_atendidos).toBeUndefined()
		const avaliacaoFinal = result.jobApplied.avaliacaoFinal as Record<string, unknown>
		expect(avaliacaoFinal.competencias_criticas).toBeUndefined()
		expect(avaliacaoFinal.nivel).toBeUndefined()
		const whatsapp = result.jobApplied.whatsappTriagemResult as Record<string, unknown>
		expect(whatsapp.porcentagem_match).toBeUndefined()
		expect(whatsapp.requisitos_atendidos).toBeUndefined()
		const exitJob = result.jobApplied.exitJobResult as Record<string, unknown>
		expect(exitJob.mapped_emotions).toBeUndefined()
		expect(exitJob.reasons_over_time).toBeUndefined()
	})

	it('keeps top-level score/feedback/analysis fields when all sections are on', () => {
		const result = stripInterviewDetail(buildTopLevelResult(), {
			score: true,
			feedback: true,
			analysis: true,
			questions: true,
		})
		expect(result.jobApplied.score).toBe(8)
		expect(result.jobApplied.recomentation).toBe('contratar')
		expect(result.jobApplied.nivel_confianca).toBe(0.9)
		expect(result.jobApplied.rejectionNote).toBeUndefined()
	})

	it('rejects an interview payload that only contains an unknown analytic key (proves allowlist, not blocklist)', () => {
		const source = {
			jobApplied: {
				id: 'ja-1',
				interview: {
					id: 'int-1',
					question: 'should not exist at interview level',
					futureAnalyticsField: 'segredo',
					info: [],
				},
			},
		}
		const result = stripInterviewDetail(source, {
			score: true,
			feedback: true,
			analysis: false,
			questions: true,
		})
		const interview = result.jobApplied.interview as Record<string, unknown>
		expect(interview.futureAnalyticsField).toBeUndefined()
	})
})
