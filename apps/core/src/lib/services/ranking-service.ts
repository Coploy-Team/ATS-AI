import type { CandidateFeatures, FeatureName, JobApplied, PostJob } from '@coploy/domain'
import { ALLOWED_FEATURES } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { createFeatureService } from './feature-service'

/**
 * Ranking explicável (V2-903 / V2-904, F3).
 *
 * Regressão logística: soma ponderada das features passada por uma sigmoide. É
 * ML clássico, roda em CPU em microssegundos, e — o que decide a escolha — cada
 * peso **é** a explicação. Gradient boosting daria um ponto ou dois de AUC e
 * custaria a frase "você está em 3º porque a nota da entrevista e a aderência
 * aos requisitos pesaram mais", que é o produto.
 *
 * ## Shadow primeiro
 *
 * `RANKING_ENFORCE` fora de `true` calcula, registra e **não mostra**. O mesmo
 * padrão do RBAC: primeiro se compara o ranking com a decisão humana real, e só
 * depois se coloca na tela. Ranking novo que ordena mal é pior que nenhum
 * ranking — ele muda decisão de carreira de gente.
 *
 * ## A baseline manda
 *
 * O modelo default reproduz "ordenar por nota da IA" com ajustes marginais. O
 * critério de aceite do plano é explícito: **se não superar a baseline, não
 * entra em produção**. Enquanto não houver treino offline com dado suficiente,
 * os pesos aqui são a baseline declarada — e não fingem ser um modelo treinado.
 */

export type ModelWeights = {
	version: string
	/** Peso por feature. Ausente = feature ignorada por este modelo. */
	weights: Partial<Record<FeatureName, number>>
	bias: number
	/** `baseline` deixa explícito que ninguém treinou nada ainda. */
	kind: 'baseline' | 'trained'
	trainedAt?: string | null
}

/**
 * Baseline versionada.
 *
 * Os pesos refletem o que o recrutador já faz na prática: olha a nota, confere
 * se atende aos requisitos, e desconta autenticidade duvidosa. Nada de
 * "aprendido" — é a régua atual, escrita para poder ser batida.
 */
export const BASELINE_MODEL: ModelWeights = {
	version: 'baseline-1',
	kind: 'baseline',
	weights: {
		interviewScore: 0.42,
		requirementCoverage: 0.18,
		competencyAverage: 0.14,
		skillOverlap: 0.1,
		occupationMatch: 0.06,
		languageScore: 0.04,
		answerCompletion: 0.03,
		authenticityScore: 0.03,
	},
	bias: 0,
	trainedAt: null,
}

/** Features em escala 0–10 entram normalizadas; o resto já é 0–1. */
const TEN_SCALE: FeatureName[] = ['interviewScore', 'competencyAverage', 'languageScore']

function normalizeFeature(name: FeatureName, value: number): number {
	if (TEN_SCALE.includes(name)) return Math.max(0, Math.min(1, value / 10))
	if (name === 'yearsOfExperience') {
		// teto em 15 anos: acima disso a diferença deixa de informar
		return Math.max(0, Math.min(1, value / 15))
	}
	return Math.max(0, Math.min(1, value))
}

export type RankingExplanation = {
	feature: FeatureName
	/** Contribuição desta feature no score final, 0–1. */
	contribution: number
	/** Valor normalizado que a alimentou. */
	value: number
}

export type RankedCandidate = {
	jobAppliedId: string
	userId: string
	/** 0–1. */
	score: number
	position: number
	/** As 3 features de maior peso, em ordem — a explicação. */
	why: RankingExplanation[]
	modelVersion: string
}

export function scoreCandidate(
	features: Partial<Record<FeatureName, number>>,
	model: ModelWeights = BASELINE_MODEL,
): { score: number; explanations: RankingExplanation[] } {
	const explanations: RankingExplanation[] = []
	let sum = model.bias
	let weightUsed = 0

	for (const name of ALLOWED_FEATURES) {
		const weight = model.weights[name]
		const value = features[name]
		if (weight === undefined || value === undefined) continue

		const normalized = normalizeFeature(name, value)
		const contribution = weight * normalized
		sum += contribution
		weightUsed += weight
		explanations.push({ feature: name, contribution, value: normalized })
	}

	/*
	 * Reescala pelo peso efetivamente usado: candidato sem avaliação de idioma
	 * não pode ficar atrás só porque a vaga não pediu idioma. Sem isso, feature
	 * ausente viraria penalidade silenciosa.
	 */
	const score = weightUsed > 0 ? Math.max(0, Math.min(1, sum / weightUsed)) : 0

	explanations.sort((a, b) => b.contribution - a.contribution)
	return { score, explanations }
}

export function createRankingService(infra: InfraProvider) {
	const featureService = createFeatureService(infra)

	/** Shadow por default: calcula, registra, não mostra. */
	function isEnforcing(): boolean {
		return process.env.RANKING_ENFORCE === 'true'
	}

	return {
		scoreCandidate,
		isEnforcing,
		model: BASELINE_MODEL,

		async rankJob(params: {
			companyId: string
			jobId: string
		}): Promise<{ enforcing: boolean; modelVersion: string; candidates: RankedCandidate[] }> {
			const { companyId, jobId } = params

			const job = (await Promise.resolve(infra.jobRepository.getJob(companyId, jobId)).catch(
				() => null,
			)) as PostJob | null

			const interviews = (await Promise.resolve(
				infra.candidateRepository.listJobInterviews(companyId, jobId),
			).catch(() => [])) as Array<Record<string, unknown>>

			const ranked: RankedCandidate[] = []

			for (const row of interviews) {
				const userId =
					(row.user_ref as { id?: string; path?: string } | undefined)?.id ??
					(row.user_ref as { path?: string } | undefined)?.path?.split('/').pop() ??
					null
				const jobAppliedId =
					(row.job_applied_ref as { id?: string; path?: string } | undefined)?.id ??
					(row.job_applied_ref as { path?: string } | undefined)?.path?.split('/').pop() ??
					String(row.id ?? '')

				if (!userId || !jobAppliedId) continue

				const [jobApplied, profile] = await Promise.all([
					Promise.resolve(infra.candidateRepository.getJobApplied(userId, jobAppliedId)).catch(
						() => null,
					) as Promise<JobApplied | null>,
					Promise.resolve(infra.userRepository.getCandidateProfile(userId)).catch(() => null),
				])

				const featureRow: CandidateFeatures = await featureService.buildFeatures({
					companyId,
					jobId,
					jobAppliedId,
					userId,
					job,
					jobApplied,
					profile: (profile ?? null) as Record<string, unknown> | null,
				})

				const { score, explanations } = scoreCandidate(featureRow.features)
				ranked.push({
					jobAppliedId,
					userId,
					score,
					position: 0,
					why: explanations.slice(0, 3),
					modelVersion: BASELINE_MODEL.version,
				})
			}

			ranked.sort((a, b) => b.score - a.score)
			ranked.forEach((item, index) => {
				item.position = index + 1
			})

			/*
			 * Shadow: registra para comparar com a decisão humana antes de a
			 * ordem virar a que o recrutador vê.
			 */
			if (!isEnforcing()) {
				console.info(
					JSON.stringify({
						tag: 'ranking.shadow',
						companyId,
						jobId,
						modelVersion: BASELINE_MODEL.version,
						top: ranked.slice(0, 5).map((item) => ({
							jobAppliedId: item.jobAppliedId,
							score: Number(item.score.toFixed(4)),
						})),
					}),
				)
			}

			return {
				enforcing: isEnforcing(),
				modelVersion: BASELINE_MODEL.version,
				candidates: ranked,
			}
		},
	}
}

export type RankingService = ReturnType<typeof createRankingService>
