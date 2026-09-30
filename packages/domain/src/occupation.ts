/**
 * Taxonomia de ocupações e skills (V2-801, F1).
 *
 * Dado **público** (CBO/MTE e ESCO/UE), não geração. A regra de runtime do deck
 * vale inteira aqui: determinístico → ML clássico em CPU → **nunca LLM**. Uma
 * taxonomia gerada por modelo não é taxonomia — é palpite com aparência de
 * padrão, e o ponto dela é justamente ser estável entre execuções.
 *
 * Zero chamada de rede em runtime: o dado é **carregado** por script, não
 * consultado. Depender da API da CBO no caminho de salvar uma vaga tornaria o
 * produto refém de um serviço público fora do nosso controle.
 */

/** Origem da taxonomia. As duas convivem e se referenciam. */
export const TAXONOMY_SOURCES = ['cbo', 'esco'] as const
export type TaxonomySource = (typeof TAXONOMY_SOURCES)[number]

export interface Occupation {
	/** `cbo:2124-05` / `esco:2512.4` — prefixado para não colidir entre fontes. */
	id: string
	source: TaxonomySource
	/** Código na fonte original, sem prefixo. */
	code: string
	/** Título canônico. É o que a UI mostra. */
	title: string
	/**
	 * Variantes que casam com o mesmo conceito, já normalizadas.
	 * "Dev Full Stack", "Desenvolvedor Fullstack" e "FullStack Developer" moram
	 * aqui — sem isso, o F3 compara strings livres e vê três ocupações.
	 */
	synonyms: string[]
	/** Hierarquia: família → grupo → ocupação. */
	familyCode?: string | null
	groupCode?: string | null
	/** Id da ocupação equivalente na outra fonte, quando existe mapeamento. */
	mappedTo?: string | null
	/** Versão da carga. Reprocessar com versão nova não perde o original. */
	taxonomyVersion: string
	language?: string | null
}

export interface Skill {
	/** `skill:react` — slug canônico. */
	id: string
	/** Nome canônico exibido. */
	name: string
	/** "ReactJS", "React.js", "react" — normalizados. */
	synonyms: string[]
	/** Agrupamento amplo (linguagem, framework, ferramenta, idioma, soft). */
	category?: string | null
	source?: TaxonomySource | 'curated' | null
	taxonomyVersion: string
	/**
	 * Skill fora do dicionário entra como livre e fica pendente de curadoria.
	 * Recusar o termo empurraria o recrutador a não descrever a vaga.
	 */
	pendingCuration?: boolean | null
	/** Quantas vezes apareceu — prioriza a fila de curadoria. */
	occurrences?: number | null
}

/**
 * Normalização canônica de texto para casamento.
 *
 * Uma função só, exportada do domain, usada tanto na carga quanto na resolução:
 * se a carga normalizar diferente da consulta, nada casa e o bug é invisível.
 */
export function normalizeTerm(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		// pontuação vira espaço: "react.js" e "react js" convergem
		.replace(/[^a-z0-9+#]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Confiança mínima para gravar a ocupação resolvida. Abaixo disso, `null`. */
export const OCCUPATION_MATCH_THRESHOLD = 0.82
