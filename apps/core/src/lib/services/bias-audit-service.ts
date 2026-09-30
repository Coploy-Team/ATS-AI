import type { InfraProvider } from '@coploy/infra'

/**
 * Auditoria de viés (V2-905, F3).
 *
 * A distinção que sustenta tudo: **a auditoria mede resultado, não ranqueia.**
 * Nenhum atributo protegido entra como feature (V2-901); aqui eles são lidos —
 * quando existem por consentimento explícito — só para comparar a taxa de
 * avanço entre grupos. Usar o atributo para medir discriminação é o oposto de
 * usá-lo para discriminar, mas os dois só se distinguem se a fronteira estiver
 * escrita e testada.
 *
 * ## Regra dos 4/5 (four-fifths rule)
 *
 * Critério do EEOC, adotado por ser o mais estabelecido: se a taxa de avanço do
 * grupo com menor taxa fica abaixo de 80% da do grupo com maior taxa, há
 * indício de impacto desproporcional. **Indício, não veredito** — o relatório
 * aponta onde olhar; a conclusão exige contexto que nenhum número traz.
 *
 * ## O bloqueio
 *
 * Disparidade acima do limiar **bloqueia a promoção do modelo** (`canPromote:
 * false`). Não é aviso: um modelo com impacto desproporcional conhecido não
 * pode ir para produção porque o resultado dele decide carreira de gente.
 */

/** Abaixo disto, a disparidade é considerada relevante. */
export const FOUR_FIFTHS_THRESHOLD = 0.8

/** Grupo pequeno demais dá razão instável; abaixo disso não se conclui nada. */
export const MIN_GROUP_SIZE = 30

export type GroupRate = {
	group: string
	total: number
	advanced: number
	/** Avançados / total. */
	rate: number
	/** Razão contra o grupo de maior taxa. `null` quando o grupo é pequeno. */
	impactRatio: number | null
	/** `true` = grupo pequeno demais para conclusão. */
	insufficient: boolean
}

export type BiasReport = {
	dimension: string
	groups: GroupRate[]
	/** Menor razão observada entre grupos com amostra suficiente. */
	worstRatio: number | null
	/** `false` bloqueia a promoção do modelo. */
	canPromote: boolean
	/** Por que bloqueou, ou por que não dá para concluir. */
	notes: string[]
}

/**
 * Calcula as taxas por grupo e aplica a regra dos 4/5.
 *
 * Função pura de propósito: é a parte auditável, e teste sobre ela vale mais
 * que teste sobre a leitura do banco.
 */
export function computeBiasReport(
	dimension: string,
	rows: Array<{ group: string | null; advanced: boolean }>,
): BiasReport {
	const notes: string[] = []
	const buckets = new Map<string, { total: number; advanced: number }>()

	for (const row of rows) {
		// sem o atributo (a pessoa não consentiu) não entra na conta — e é o
		// caso comum, por design: consentimento é opt-in
		if (!row.group) continue
		const bucket = buckets.get(row.group) ?? { total: 0, advanced: 0 }
		bucket.total += 1
		if (row.advanced) bucket.advanced += 1
		buckets.set(row.group, bucket)
	}

	const groups: GroupRate[] = [...buckets.entries()].map(([group, bucket]) => ({
		group,
		total: bucket.total,
		advanced: bucket.advanced,
		rate: bucket.total > 0 ? bucket.advanced / bucket.total : 0,
		impactRatio: null,
		insufficient: bucket.total < MIN_GROUP_SIZE,
	}))

	const eligible = groups.filter((group) => !group.insufficient)

	if (eligible.length < 2) {
		notes.push(
			`Amostra insuficiente: menos de dois grupos com ${MIN_GROUP_SIZE}+ candidaturas. Sem conclusão.`,
		)
		// sem base para afirmar disparidade, não há base para bloquear
		return { dimension, groups, worstRatio: null, canPromote: true, notes }
	}

	const best = Math.max(...eligible.map((group) => group.rate))
	if (best === 0) {
		notes.push('Nenhum candidato avançou no período — razão indefinida.')
		return { dimension, groups, worstRatio: null, canPromote: true, notes }
	}

	for (const group of eligible) {
		group.impactRatio = group.rate / best
	}

	const worstRatio = Math.min(...eligible.map((group) => group.impactRatio ?? 1))
	const canPromote = worstRatio >= FOUR_FIFTHS_THRESHOLD

	if (!canPromote) {
		const worst = eligible.find((group) => group.impactRatio === worstRatio)
		notes.push(
			`Regra dos 4/5 violada em "${dimension}": grupo "${worst?.group}" avança a ` +
				`${Math.round(worstRatio * 100)}% da taxa do grupo de maior avanço (limite: 80%). ` +
				'Promoção do modelo bloqueada.',
		)
	}

	return { dimension, groups, worstRatio, canPromote, notes }
}

export function createBiasAuditService(infra: InfraProvider) {
	return {
		computeBiasReport,

		/**
		 * Relatório por dimensão sobre as candidaturas da janela.
		 *
		 * Só olha quem consentiu: sem consentimento o atributo não existe no
		 * dado, e a auditoria roda sobre a fatia que existe — dizendo o tamanho
		 * dela, para ninguém tomar amostra pequena por evidência.
		 */
		async run(params: {
			companyId?: string
			days?: number
			dimensions?: string[]
		}): Promise<{ reports: BiasReport[]; canPromote: boolean; sampled: number }> {
			const since = new Date()
			since.setDate(since.getDate() - (params.days ?? 180))
			const dimensions = params.dimensions ?? ['gender', 'race', 'ageRange']

			const companies = params.companyId
				? [{ id: params.companyId }]
				: ((await Promise.resolve(infra.companyRepository.listCompanies()).catch(() => [])) as Array<{
						id: string
					}>)

			const rows: Array<Record<string, unknown>> = []
			for (const company of companies) {
				const interviews = (await Promise.resolve(
					infra.candidateRepository.listCompanyInterviews(company.id, {
						filters: [{ field: 'date', operator: '>=', value: since }],
					}),
				).catch(() => [])) as Array<Record<string, unknown>>
				rows.push(...interviews)
			}

			const reports = dimensions.map((dimension) =>
				computeBiasReport(
					dimension,
					rows.map((row) => ({
						/*
						 * O atributo vem do perfil só quando a pessoa consentiu em
						 * fornecê-lo para fins estatísticos. Ausente é o default.
						 */
						group: (row[`demographic_${dimension}`] as string | undefined) ?? null,
						advanced: ['approved', 'hired', 'selected'].includes(
							String(row.candidateStatus ?? row.candidate_status ?? '').toLowerCase(),
						),
					})),
				),
			)

			return {
				reports,
				// um único bloqueio basta: não se promove modelo com viés conhecido
				canPromote: reports.every((report) => report.canPromote),
				sampled: rows.length,
			}
		},
	}
}

export type BiasAuditService = ReturnType<typeof createBiasAuditService>
