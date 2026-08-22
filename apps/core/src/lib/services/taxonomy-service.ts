import type { Occupation, Skill } from '@coploy/domain'
import { OCCUPATION_MATCH_THRESHOLD, normalizeTerm } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * Normalização de cargo e skill (V2-802, F1).
 *
 * **Determinístico, sem LLM.** Não é economia — é requisito: a mesma entrada tem
 * que dar a mesma saída hoje e daqui a seis meses, senão o ranking do F3 muda
 * sozinho e ninguém consegue explicar por quê. Um modelo generativo aqui
 * tornaria a taxonomia não-reprodutível, que é o oposto do que ela existe para
 * ser.
 *
 * A régua de casamento, em ordem de custo:
 *
 * 1. **Exato** sobre o termo normalizado (título ou sinônimo) — confiança 1.
 * 2. **Contido**: o texto contém o termo canônico inteiro ("desenvolvedor react
 *    pleno" → "desenvolvedor react"). Confiança proporcional ao quanto do texto
 *    o termo cobre.
 * 3. **Distância de edição** (Levenshtein normalizado), que pega erro de
 *    digitação sem inventar equivalência semântica.
 *
 * Abaixo do limiar devolve `null` **em vez de chutar**. Ocupação errada é pior
 * que ocupação ausente: ausente a tela mostra o texto que a pessoa escreveu;
 * errada ela mostra outra profissão com cara de verdade.
 */

export type OccupationMatch = {
	occupation: Occupation
	/** 0–1. */
	confidence: number
	matchedOn: 'exact' | 'contains' | 'fuzzy'
}

/** Levenshtein iterativo com duas linhas — O(n·m) tempo, O(m) memória. */
export function editDistance(a: string, b: string): number {
	if (a === b) return 0
	if (a.length === 0) return b.length
	if (b.length === 0) return a.length

	let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
	let current = new Array<number>(b.length + 1)

	for (let i = 1; i <= a.length; i += 1) {
		current[0] = i
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
		}
		const swap = previous
		previous = current
		current = swap
	}

	return previous[b.length]
}

/** 1 = idêntico, 0 = nada em comum. */
export function similarity(a: string, b: string): number {
	const longest = Math.max(a.length, b.length)
	if (longest === 0) return 1
	return 1 - editDistance(a, b) / longest
}

type IndexEntry = { term: string; occupation: Occupation }

export function createTaxonomyService(infra: InfraProvider) {
	/*
	 * Índice em memória, construído uma vez por processo.
	 *
	 * Resolver cargo acontece ao salvar vaga e ao salvar perfil — caminho quente.
	 * Ir ao banco a cada chamada tornaria a normalização cara o bastante para
	 * alguém decidir desligá-la, e taxonomia opcional não serve de insumo pro F3.
	 */
	let occupationIndex: IndexEntry[] | null = null
	let skillIndex: Map<string, Skill> | null = null
	let loading: Promise<void> | null = null

	async function ensureLoaded(): Promise<void> {
		if (occupationIndex && skillIndex) return
		// chamadas concorrentes no boot compartilham a mesma carga
		if (loading) return loading

		loading = (async () => {
			const [occupations, skills] = await Promise.all([
				Promise.resolve(infra.taxonomyRepository.listOccupations()).catch(() => []),
				Promise.resolve(infra.taxonomyRepository.listSkills()).catch(() => []),
			])

			const entries: IndexEntry[] = []
			for (const occupation of occupations) {
				entries.push({ term: normalizeTerm(occupation.title), occupation })
				for (const synonym of occupation.synonyms ?? []) {
					entries.push({ term: normalizeTerm(synonym), occupation })
				}
			}
			// termo longo primeiro: "desenvolvedor react" deve ganhar de "desenvolvedor"
			entries.sort((a, b) => b.term.length - a.term.length)
			occupationIndex = entries

			const map = new Map<string, Skill>()
			for (const skill of skills) {
				map.set(normalizeTerm(skill.name), skill)
				for (const synonym of skill.synonyms ?? []) {
					map.set(normalizeTerm(synonym), skill)
				}
			}
			skillIndex = map
		})()

		await loading
		loading = null
	}

	return {
		/** Invalida o índice — usado pelo script de carga. */
		reset() {
			occupationIndex = null
			skillIndex = null
		},

		async resolveOccupation(text: string | null | undefined): Promise<OccupationMatch | null> {
			if (!text?.trim()) return null
			await ensureLoaded()
			const entries = occupationIndex ?? []
			if (entries.length === 0) return null

			const needle = normalizeTerm(text)
			if (!needle) return null

			for (const entry of entries) {
				if (entry.term === needle) {
					return { occupation: entry.occupation, confidence: 1, matchedOn: 'exact' }
				}
			}

			/*
			 * Contido: exige limite de palavra dos dois lados. Sem isso, "java"
			 * casaria dentro de "javascript" — dois cargos completamente
			 * diferentes com uma substring em comum.
			 */
			for (const entry of entries) {
				if (!entry.term) continue
				const bounded = new RegExp(`(^| )${entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`)
				if (bounded.test(needle)) {
					const coverage = entry.term.length / needle.length
					// cobertura vira confiança, com teto abaixo do casamento exato
					const confidence = Math.min(0.98, 0.6 + coverage * 0.38)
					if (confidence >= OCCUPATION_MATCH_THRESHOLD) {
						return { occupation: entry.occupation, confidence, matchedOn: 'contains' }
					}
				}
			}

			let best: OccupationMatch | null = null
			for (const entry of entries) {
				const score = similarity(needle, entry.term)
				if (score >= OCCUPATION_MATCH_THRESHOLD && (!best || score > best.confidence)) {
					best = { occupation: entry.occupation, confidence: score, matchedOn: 'fuzzy' }
				}
			}

			// abaixo do limiar: null. Chutar seria pior que não saber.
			return best
		},

		/**
		 * Resolve skills livres para canônicas.
		 *
		 * O que não casa **não é descartado**: volta como livre e entra na fila de
		 * curadoria. Recusar o termo empurraria o recrutador a não descrever a
		 * vaga — e a descrição é o insumo de tudo.
		 */
		async resolveSkills(
			terms: string[],
			options: { taxonomyVersion?: string; recordPending?: boolean } = {},
		): Promise<{ canonical: Skill[]; free: string[] }> {
			await ensureLoaded()
			const index = skillIndex ?? new Map()

			const canonical: Skill[] = []
			const free: string[] = []
			const seen = new Set<string>()

			for (const term of terms) {
				const normalized = normalizeTerm(term)
				if (!normalized || seen.has(normalized)) continue
				seen.add(normalized)

				const match = index.get(normalized)
				if (match) {
					if (!canonical.some((item) => item.id === match.id)) canonical.push(match)
					continue
				}

				free.push(term.trim())
				if (options.recordPending) {
					await Promise.resolve(
						infra.taxonomyRepository.recordPendingSkill(
							normalized,
							options.taxonomyVersion ?? 'free',
						),
					).catch(() => undefined)
				}
			}

			return { canonical, free }
		},
	}
}

export type TaxonomyService = ReturnType<typeof createTaxonomyService>
