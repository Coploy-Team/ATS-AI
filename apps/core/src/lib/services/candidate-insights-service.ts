import type { InfraProvider } from '@coploy/infra'
import type { JobApplied } from '@coploy/domain'

/**
 * Insights de carreira do candidato.
 *
 * A régua: **veredito é do recrutador, ofício é do candidato**.
 *
 * - Veredito — nota, aprovado/reprovado, ranking, aderência à vaga — responde
 *   "essa pessoa serve para a minha vaga?". É a decisão de quem contrata e não
 *   sai daqui, nem como número nem traduzido em rótulo.
 * - Ofício — se ele estrutura a resposta, se traz exemplo concreto, se
 *   aprofunda, quais competências aparecem como força — descreve o
 *   comportamento *dele*. Isso é dele, e é o que permite evoluir.
 *
 * Por isso tudo aqui é agregado e comparado **da pessoa com ela mesma**, nunca
 * com uma barra: "entre as suas dimensões, exemplos é a mais forte" não diz
 * nada sobre ter passado numa entrevista. Uma entrevista isolada vira boletim;
 * cinco entrevistas viram padrão — e padrão é o que ninguém mais consegue
 * mostrar pra ele.
 */

const MAX_INTERVIEWS = 50

/** Aparecer em duas entrevistas separa padrão de acaso. */
const RECURRENCE_THRESHOLD = 2

const MAX_ITEMS = 4

export type CommunicationDimension = 'structure' | 'examples' | 'depth'

export interface CandidateInsights {
	/** Quantas entrevistas concluídas alimentaram a análise. */
	interviewsAnalyzed: number
	/** As três dimensões ordenadas da mais forte para a com mais espaço. */
	dimensionRanking: CommunicationDimension[]
	/** A dimensão em que ele se sai melhor comparado a si mesmo. */
	strongestDimension: CommunicationDimension | null
	/** A que mais tem espaço, comparada às outras dele. */
	dimensionToImprove: CommunicationDimension | null
	/** Só marcamos melhora; oscilação não vira narrativa de piora. */
	improvingDimensions: CommunicationDimension[]
	/** Competências que apareceram como força em 2+ entrevistas. */
	recurringStrengths: string[]
	/** Competências que apareceram como desenvolvimento em 2+ entrevistas. */
	recurringDevelopment: string[]
	/** Sugestões práticas, sem repetir a mesma ideia. */
	suggestions: string[]
}

/** Dimensões chegam em 0–1 em docs antigos e 0–10 nos novos. */
function normalize(value: unknown): number | null {
	const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
	if (!Number.isFinite(parsed) || parsed <= 0) return null
	return parsed <= 1 ? parsed * 10 : parsed
}

function average(values: number[]): number | null {
	if (values.length === 0) return null
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizeLabel(value: string): string {
	return value.trim().toLowerCase()
}

/** Conta ocorrências preservando a grafia da primeira aparição. */
function countByLabel(items: string[]): Map<string, { label: string; count: number }> {
	const counts = new Map<string, { label: string; count: number }>()
	for (const item of items) {
		const key = normalizeLabel(item)
		if (!key) continue
		const current = counts.get(key)
		if (current) current.count += 1
		else counts.set(key, { label: item.trim(), count: 1 })
	}
	return counts
}

function topRecurring(items: string[], minCount: number): string[] {
	return [...countByLabel(items).values()]
		.filter((entry) => entry.count >= minCount)
		.sort((a, b) => b.count - a.count)
		.slice(0, MAX_ITEMS)
		.map((entry) => entry.label)
}

interface CompetencyBucket {
	strengths: string[]
	development: string[]
	suggestions: string[]
}

function collectCompetencies(jobApplied: JobApplied): CompetencyBucket {
	const evaluation = jobApplied.avaliacaoFinal
	const competencies = [
		...(evaluation?.competencias_criticas ?? []),
		...(evaluation?.competencias_adicionais ?? []),
	]

	return {
		// A competência nomeada é o sinal estável; a frase livre quase nunca se
		// repete literalmente entre entrevistas e não serviria pra contar padrão.
		strengths: competencies
			.filter((item) => (item.pontos_fortes?.length ?? 0) > 0)
			.map((item) => item.nome ?? '')
			.filter(Boolean),
		development: competencies
			.filter((item) => (item.pontos_desenvolvimento?.length ?? 0) > 0)
			.map((item) => item.nome ?? '')
			.filter(Boolean),
		// SÓ `sugestoes_melhoria`. `generalImprovement` parece conselho pelo nome,
		// mas na prática guarda requisito não atendido da vaga ("experiência
		// comprovada com Spring", "habilidades de liderança") — é a avaliação do
		// recrutador com outra roupa, e mostrar isso ao candidato entrega o
		// veredito pela porta dos fundos.
		suggestions: (evaluation?.recomendacoes?.sugestoes_melhoria ?? []).filter(Boolean),
	}
}

export function createCandidateInsightsService(infra: InfraProvider) {
	return {
		async getInsights(userId: string): Promise<CandidateInsights> {
			const applied = await infra.candidateRepository.listJobsApplied(userId, {
				limitTo: MAX_INTERVIEWS,
			})

			// Só entrevista concluída tem avaliação; as pendentes não dizem nada
			// sobre como a pessoa se comunica.
			const finished = applied.filter((item) => item.finished === true)

			const empty: CandidateInsights = {
				interviewsAnalyzed: finished.length,
				dimensionRanking: [],
				strongestDimension: null,
				dimensionToImprove: null,
				improvingDimensions: [],
				recurringStrengths: [],
				recurringDevelopment: [],
				suggestions: [],
			}
			if (finished.length === 0) return empty

			// Mais antiga primeiro: a ordem é o que permite falar de evolução.
			const chronological = [...finished].sort(
				(a, b) =>
					new Date(a.finishedTime ?? a.appliedTime ?? 0).getTime() -
					new Date(b.finishedTime ?? b.appliedTime ?? 0).getTime(),
			)

			const series: Record<CommunicationDimension, number[]> = {
				structure: [],
				examples: [],
				depth: [],
			}
			const strengths: string[] = []
			const development: string[] = []
			const suggestions: string[] = []

			for (const item of chronological) {
				const interview = item.interview
				const structure = normalize(interview?.estruturacao)
				const examples = normalize(interview?.exemplificacao)
				const depth = normalize(interview?.profundidade)
				if (structure !== null) series.structure.push(structure)
				if (examples !== null) series.examples.push(examples)
				if (depth !== null) series.depth.push(depth)

				const bucket = collectCompetencies(item)
				strengths.push(...bucket.strengths)
				development.push(...bucket.development)
				suggestions.push(...bucket.suggestions)
			}

			const averages = (
				Object.entries(series) as Array<[CommunicationDimension, number[]]>
			)
				.map(([dimension, values]) => ({ dimension, value: average(values) }))
				.filter((entry): entry is { dimension: CommunicationDimension; value: number } =>
					entry.value !== null,
				)
				.sort((a, b) => b.value - a.value)

			/**
			 * Melhora = média da metade recente acima da metade antiga.
			 * Não existe "piorando": uma entrevista ruim não é uma trajetória, e
			 * transformar oscilação em narrativa de queda desmotiva sem informar.
			 */
			const improving = (Object.entries(series) as Array<[CommunicationDimension, number[]]>)
				.filter(([, values]) => values.length >= 4)
				.filter(([, values]) => {
					const half = Math.floor(values.length / 2)
					const older = average(values.slice(0, half))
					const recent = average(values.slice(half))
					return older !== null && recent !== null && recent - older >= 0.5
				})
				.map(([dimension]) => dimension)

			// Com uma entrevista só não há recorrência a apurar — mostrar o que
			// apareceu uma vez ainda é melhor que uma tela vazia.
			const minCount = finished.length >= RECURRENCE_THRESHOLD ? RECURRENCE_THRESHOLD : 1

			return {
				interviewsAnalyzed: finished.length,
				dimensionRanking: averages.map((entry) => entry.dimension),
				strongestDimension: averages[0]?.dimension ?? null,
				dimensionToImprove:
					averages.length > 1 ? averages[averages.length - 1].dimension : null,
				improvingDimensions: improving,
				recurringStrengths: topRecurring(strengths, minCount),
				recurringDevelopment: topRecurring(development, minCount),
				suggestions: [...countByLabel(suggestions).values()]
					.sort((a, b) => b.count - a.count)
					.slice(0, 3)
					.map((entry) => entry.label),
			}
		},
	}
}

export type CandidateInsightsService = ReturnType<typeof createCandidateInsightsService>
