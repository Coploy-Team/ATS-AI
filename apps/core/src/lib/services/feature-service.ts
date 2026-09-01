import type {
	CandidateEvaluation,
	CandidateFeatures,
	FeatureName,
	JobApplied,
	OutcomeLabel,
	PostJob,
} from '@coploy/domain'
import { ALLOWED_FEATURES, normalizeTerm, normalizeStageId } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { createTaxonomyService } from './taxonomy-service'

/**
 * Extração de features e rótulos (V2-901 / V2-902, F3).
 *
 * Tudo aqui é **derivado do que já existe** — nota, competências, requisitos
 * tipados, taxonomia. Nenhum dado novo é coletado do candidato para alimentar o
 * modelo: pedir mais informação para ranquear melhor inverteria a relação, já
 * que quem paga o custo de responder é quem menos ganha com o ranking.
 *
 * A allowlist do domain é a fronteira. Se uma feature não está lá, ela não sai
 * daqui — nem por engano de merge, porque a montagem filtra pelo conjunto.
 */

function toNumber(value: unknown): number | null {
	const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/** Escala 0–1 vinda do banco convive com 0–10; normaliza sem inventar. */
function toScore10(value: unknown): number | null {
	const parsed = toNumber(value)
	if (parsed === null) return null
	return parsed <= 1 ? parsed * 10 : parsed
}

/** Interseção de skills, case- e pontuação-insensível, sobre o total pedido. */
export function skillOverlap(jobSkills: string[], candidateSkills: string[]): number | null {
	const wanted = new Set(jobSkills.map(normalizeTerm).filter(Boolean))
	if (wanted.size === 0) return null
	const has = new Set(candidateSkills.map(normalizeTerm).filter(Boolean))
	let hits = 0
	for (const skill of wanted) if (has.has(skill)) hits += 1
	return hits / wanted.size
}

/**
 * Rótulo do desfecho (V2-902).
 *
 * Ordem importa: contratado ganha de aprovado, e reprovação por knockout é
 * marcada antes da reprovação por decisão — se as duas coincidem no doc, o que
 * de fato aconteceu foi o filtro automático.
 */
export function resolveOutcome(jobApplied: Partial<JobApplied>): OutcomeLabel {
	const stage = normalizeStageId(jobApplied.candidateStatus ?? undefined)

	if (stage === 'hired') return 'hired'
	if (stage === 'rejected') {
		const knockout = jobApplied.screeningKnockoutResult
		if (knockout && knockout.passed === false) return 'rejected_knockout'
		return 'rejected_decision'
	}
	if (['selected', 'approved'].includes(stage)) return 'advanced'
	return 'pending'
}

export function createFeatureService(infra: InfraProvider) {
	const taxonomy = createTaxonomyService(infra)

	return {
		resolveOutcome,
		skillOverlap,

		/**
		 * Monta as features de um candidato numa vaga.
		 *
		 * Feature ausente fica **ausente**, não zero: zero é uma medição ("tirou
		 * 0 na entrevista") e ausência é a falta dela. Colapsar as duas ensinaria
		 * o modelo que quem não foi avaliado é ruim.
		 */
		async buildFeatures(params: {
			companyId: string
			jobId: string
			jobAppliedId: string
			userId: string
			job: PostJob | null
			jobApplied: Partial<JobApplied> | null
			profile: Record<string, unknown> | null
		}): Promise<CandidateFeatures> {
			const { job, jobApplied, profile } = params
			const raw: Partial<Record<FeatureName, number>> = {}

			const interview = jobApplied?.interview as
				| { score?: unknown; info?: Array<Record<string, unknown>>; cheat?: Record<string, unknown> }
				| undefined

			const score = toScore10(interview?.score ?? jobApplied?.score)
			if (score !== null) raw.interviewScore = score

			const evaluation = jobApplied?.avaliacaoFinal as CandidateEvaluation | undefined
			const competencies = [
				...((evaluation?.competencias_criticas as Array<{ nota?: unknown }>) ?? []),
				...((evaluation?.competencias_adicionais as Array<{ nota?: unknown }>) ?? []),
			]
				.map((item) => toScore10(item?.nota))
				.filter((value): value is number => value !== null)
			if (competencies.length > 0) {
				raw.competencyAverage =
					competencies.reduce((sum, value) => sum + value, 0) / competencies.length
			}

			const requirements = (job?.structuredRequirements ?? []) as Array<{ required?: boolean }>
			const met = toNumber(jobApplied?.requisitos_atendidos)
			if (requirements.length > 0 && met !== null) {
				raw.requirementCoverage = Math.min(1, met / requirements.length)
			}

			const jobSkills = (job?.mainSkills ?? '').split(',')
			const candidateSkills = Array.isArray(profile?.skills)
				? (profile?.skills as string[])
				: []
			const overlap = skillOverlap(jobSkills, candidateSkills)
			if (overlap !== null) raw.skillOverlap = overlap

			const years = toNumber(profile?.yearsOfExperience)
			if (years !== null) raw.yearsOfExperience = years

			/*
			 * Ocupação: compara o código canônico dos dois lados. Comparar os
			 * textos livres traria de volta exatamente o problema que a taxonomia
			 * resolve.
			 */
			const jobOccupation =
				job?.occupationCode ?? (await taxonomy.resolveOccupation(job?.jobName))?.occupation.id
			const candidateOccupation =
				(profile?.occupationCode as string | undefined) ??
				(await taxonomy.resolveOccupation(profile?.occupation as string | undefined))?.occupation
					.id
			if (jobOccupation && candidateOccupation) {
				raw.occupationMatch = jobOccupation === candidateOccupation ? 1 : 0
			}

			const completeness = toNumber(profile?.completeness)
			if (completeness !== null) raw.profileCompleteness = completeness / 100

			const questions = interview?.info ?? []
			if (questions.length > 0) {
				const answered = questions.filter(
					(item) => item.finished === true && item.pulou_a_pergunta !== true,
				).length
				raw.answerCompletion = answered / questions.length
			}

			const authenticity = toNumber(
				(interview?.cheat as { pontuacao_autenticidade?: unknown } | undefined)
					?.pontuacao_autenticidade,
			)
			if (authenticity !== null) {
				raw.authenticityScore = authenticity > 1 ? authenticity / 100 : authenticity
			}

			const language = toScore10(
				(jobApplied?.languageEvaluation as { score?: unknown } | undefined)?.score,
			)
			if (language !== null) raw.languageScore = language

			// a allowlist é a fronteira, aplicada na montagem e não só no papel
			const features: Partial<Record<FeatureName, number>> = {}
			for (const name of ALLOWED_FEATURES) {
				const value = raw[name]
				if (typeof value === 'number' && Number.isFinite(value)) features[name] = value
			}

			return {
				id: `${params.jobId}:${params.jobAppliedId}`,
				companyId: params.companyId,
				jobId: params.jobId,
				jobAppliedId: params.jobAppliedId,
				userId: params.userId,
				features,
				taxonomyVersion: (job?.taxonomyVersion as string) ?? null,
				computedAt: new Date(),
			}
		},
	}
}

export type FeatureService = ReturnType<typeof createFeatureService>
