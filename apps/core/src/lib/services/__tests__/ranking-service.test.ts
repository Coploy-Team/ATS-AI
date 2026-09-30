import { ALLOWED_FEATURES, FORBIDDEN_FEATURES } from '@coploy/domain'

import { computeBiasReport, FOUR_FIFTHS_THRESHOLD } from '../bias-audit-service'
import { createFeatureService, resolveOutcome, skillOverlap } from '../feature-service'
import { BASELINE_MODEL, scoreCandidate } from '../ranking-service'
import { createMockInfra } from './mock-infra'

describe('features permitidas (V2-901)', () => {
	it('NENHUM atributo protegido é feature — nem por acidente de merge', () => {
		const allowed = new Set<string>(ALLOWED_FEATURES)
		for (const forbidden of FORBIDDEN_FEATURES) {
			expect(allowed.has(forbidden)).toBe(false)
		}
	})

	it('o modelo só pondera features da allowlist', () => {
		for (const name of Object.keys(BASELINE_MODEL.weights)) {
			expect(ALLOWED_FEATURES).toContain(name)
		}
	})

	it('feature ausente fica ausente, não vira zero', async () => {
		const infra = createMockInfra()
		const result = await createFeatureService(infra).buildFeatures({
			companyId: 'c1',
			jobId: 'job-1',
			jobAppliedId: 'ja-1',
			userId: 'u1',
			job: null,
			jobApplied: null,
			profile: null,
		})

		// nenhuma medição existe: o objeto vem vazio, não cheio de zeros
		expect(Object.keys(result.features)).toHaveLength(0)
	})

	it('normaliza escala 0–1 e 0–10 sem inventar valor', async () => {
		const infra = createMockInfra()
		const service = createFeatureService(infra)

		const a = await service.buildFeatures({
			companyId: 'c1',
			jobId: 'j',
			jobAppliedId: 'ja',
			userId: 'u',
			job: null,
			jobApplied: { interview: { score: 0.86 } } as never,
			profile: null,
		})
		expect(a.features.interviewScore).toBeCloseTo(8.6)
	})
})

describe('skillOverlap', () => {
	it('casa variantes normalizadas', () => {
		expect(skillOverlap(['Node.js', 'React'], ['node js', 'react'])).toBe(1)
	})

	it('vaga sem skills devolve null, não zero', () => {
		expect(skillOverlap([], ['React'])).toBeNull()
	})
})

describe('rótulo de desfecho (V2-902)', () => {
	it('separa reprovação por knockout da reprovação por decisão', () => {
		expect(
			resolveOutcome({
				candidateStatus: 'Rejected',
				screeningKnockoutResult: { passed: false } as never,
			}),
		).toBe('rejected_knockout')

		expect(resolveOutcome({ candidateStatus: 'Rejected' })).toBe('rejected_decision')
	})

	it('contratado ganha de aprovado, e em processo é pending', () => {
		expect(resolveOutcome({ candidateStatus: 'Hired' })).toBe('hired')
		expect(resolveOutcome({ candidateStatus: 'Approved' })).toBe('advanced')
		expect(resolveOutcome({ candidateStatus: 'Pending' })).toBe('pending')
	})
})

describe('scoreCandidate (V2-903/904)', () => {
	it('é determinístico — mesma entrada, mesma saída', () => {
		const features = { interviewScore: 8.6, requirementCoverage: 0.8 }
		const a = scoreCandidate(features)
		const b = scoreCandidate(features)
		expect(a.score).toBe(b.score)
	})

	it('nota maior sobe no ranking, mantido o resto igual', () => {
		const low = scoreCandidate({ interviewScore: 5, requirementCoverage: 0.5 })
		const high = scoreCandidate({ interviewScore: 9, requirementCoverage: 0.5 })
		expect(high.score).toBeGreaterThan(low.score)
	})

	it('feature ausente não penaliza — reescala pelo peso usado', () => {
		/*
		 * Vaga que não pede idioma não pode empurrar o candidato para baixo por
		 * não ter nota de idioma. Sem reescala, ausência viraria zero.
		 */
		const semIdioma = scoreCandidate({ interviewScore: 9 })
		const comIdiomaAlto = scoreCandidate({ interviewScore: 9, languageScore: 9 })
		expect(semIdioma.score).toBeCloseTo(comIdiomaAlto.score, 5)
	})

	it('a explicação vem ordenada por contribuição', () => {
		const { explanations } = scoreCandidate({
			interviewScore: 9,
			skillOverlap: 0.2,
			requirementCoverage: 0.9,
		})
		expect(explanations[0].feature).toBe('interviewScore')
		for (let i = 1; i < explanations.length; i += 1) {
			expect(explanations[i - 1].contribution).toBeGreaterThanOrEqual(
				explanations[i].contribution,
			)
		}
	})

	it('score fica no intervalo 0–1', () => {
		const máximo = scoreCandidate({
			interviewScore: 10,
			requirementCoverage: 1,
			competencyAverage: 10,
			skillOverlap: 1,
			occupationMatch: 1,
			languageScore: 10,
			answerCompletion: 1,
			authenticityScore: 1,
		})
		expect(máximo.score).toBeLessThanOrEqual(1)
		expect(scoreCandidate({}).score).toBe(0)
	})

	it('o modelo default se declara baseline — ninguém treinou nada ainda', () => {
		expect(BASELINE_MODEL.kind).toBe('baseline')
		expect(BASELINE_MODEL.trainedAt).toBeNull()
	})
})

describe('auditoria de viés (V2-905)', () => {
	function rows(group: string, total: number, advanced: number) {
		return Array.from({ length: total }, (_, index) => ({
			group,
			advanced: index < advanced,
		}))
	}

	it('bloqueia a promoção quando a regra dos 4/5 é violada', () => {
		const report = computeBiasReport('gender', [
			...rows('a', 100, 50), // 50%
			...rows('b', 100, 30), // 30% → razão 0,6
		])

		expect(report.worstRatio).toBeCloseTo(0.6)
		expect(report.canPromote).toBe(false)
		expect(report.notes[0]).toMatch(/4\/5/)
	})

	it('disparidade dentro do limite não bloqueia', () => {
		const report = computeBiasReport('gender', [...rows('a', 100, 50), ...rows('b', 100, 45)])
		expect(report.worstRatio).toBeGreaterThanOrEqual(FOUR_FIFTHS_THRESHOLD)
		expect(report.canPromote).toBe(true)
	})

	it('amostra pequena não conclui nem bloqueia — e diz isso', () => {
		const report = computeBiasReport('race', [...rows('a', 10, 5), ...rows('b', 8, 1)])
		expect(report.canPromote).toBe(true)
		expect(report.worstRatio).toBeNull()
		expect(report.notes[0]).toMatch(/insuficiente/i)
		expect(report.groups.every((group) => group.insufficient)).toBe(true)
	})

	it('quem não consentiu simplesmente não entra na conta', () => {
		const report = computeBiasReport('gender', [
			...rows('a', 40, 20),
			...rows('b', 40, 18),
			...Array.from({ length: 500 }, () => ({ group: null, advanced: true })),
		])
		const total = report.groups.reduce((sum, group) => sum + group.total, 0)
		expect(total).toBe(80)
	})
})
