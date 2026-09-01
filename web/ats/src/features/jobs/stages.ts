/**
 * Etapas do pipeline: cor e ordem ESTÁVEIS por chave de status.
 *
 * Bug que isto corrige: colorir por índice fazia a mesma etapa mudar de cor
 * entre linhas (a vaga A começava em `approved`, a B em `pending`), o que
 * torna a barra ilegível sem tooltip. Cor de etapa é vocabulário — tem que
 * ser a mesma no app inteiro.
 *
 * A régua canônica vive em `@coploy/domain` e chega pelo contrato
 * (`GET /kanban-config` devolve `stages` com rótulo e semântica). Aqui ficam
 * só COR e FALLBACK de rótulo — o que o servidor não tem como decidir por
 * ser questão de tema. Ordem e nome vêm de lá.
 */
export const CANONICAL_STAGES = [
	'applied',
	'pending',
	'selected',
	'approved',
	'hired',
	'rejected',
] as const

/**
 * A escala conta a história do funil: entra frio (violeta), esquenta na
 * avaliação (amarelo/ciano) e fecha em lime. Reprovado é o único rosa —
 * cor de saída, não de progresso.
 */
const STAGE_FILL: Record<string, string> = {
	applied: 'bg-data-violet',
	pending: 'bg-data-yellow',
	selected: 'bg-data-cyan',
	approved: 'bg-lime',
	hired: 'bg-lime-deep',
	rejected: 'bg-data-pink',
}

/** Paleta de fallback pra colunas customizadas (fills no matiz da marca). */
const CUSTOM_FILL = ['bg-data-done', 'bg-data-cyan/60', 'bg-lime/60', 'bg-data-pink/60']

/**
 * Chave normalizada. O dado real tem casing misto (`approved` e `Selected`
 * convivem no banco) — sem isto, metade das etapas cai no fallback de cor e
 * fica sem tradução. O core normaliza também, mas o cliente NÃO pode
 * depender disso: a versão em produção pode estar atrás.
 */
export function normalizeStageKey(raw: string): string {
	const key = raw.trim().toLowerCase()
	return key === '' || key === 'sem_etapa' ? 'pending' : key
}

export function stageFill(key: string): string {
	const known = STAGE_FILL[key]
	if (known) return known
	let hash = 0
	for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0
	return CUSTOM_FILL[Math.abs(hash) % CUSTOM_FILL.length]
}

export function stageOrder(key: string): number {
	const i = CANONICAL_STAGES.indexOf(key as (typeof CANONICAL_STAGES)[number])
	return i === -1 ? 99 : i
}

/** Etapas que encerram a jornada — o relógio de SLA para nelas. */
const TERMINAL_STAGES = new Set(['approved', 'hired', 'rejected'])

export function isTerminalStage(key: string): boolean {
	return TERMINAL_STAGES.has(key)
}

/**
 * Rótulo humano. Canônico → i18n; coluna customizada → o id sem o sufixo
 * `_<timestamp>` que o kanban-service gera (`triagem_m2x9k1` → "Triagem").
 *
 * Quando o servidor manda `stages` resolvidas, prefira o `label` de lá — é
 * ele que carrega o rótulo customizado da empresa.
 */
/*
 * Vocabulário por edição: sem o Motor, "Entrevista IA" é rótulo de uma coisa
 * que a instalação não tem — a etapa continua existindo (entrevista HUMANA),
 * só muda o nome. Flag de módulo alimentada pelas capabilities (mesmo padrão
 * anti-flicker do menu: assignment idempotente, re-render vem do provider).
 */
let motorVocabulary = true
export function setMotorVocabulary(motor: boolean) {
	motorVocabulary = motor
}

export function stageLabel(key: string, t: (k: string) => string): string {
	if (key === 'pending' && !motorVocabulary) {
		const manual = t('stages.pendingManual')
		if (manual !== 'stages.pendingManual') return manual
	}
	const i18nKey = `stages.${key}`
	const translated = t(i18nKey)
	if (translated !== i18nKey) return translated
	const withoutSuffix = key.replace(/_[a-z0-9]{4,}$/i, '').replace(/_/g, ' ')
	return withoutSuffix.charAt(0).toUpperCase() + withoutSuffix.slice(1)
}
