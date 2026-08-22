import type { empresa } from '@coploy/sdk'

import type { JobStatus } from '@/components/status-badge'

import { normalizeStageKey, stageOrder } from './stages'

type JobDto = empresa.GetCompaniesJobs200JobsItem

/**
 * Anticorrupção (ADR-004 item 7): o DTO do core carrega legado (flags soltas,
 * `carrerLevel` com typo). O ats mapeia pro modelo de UI aqui e NUNCA espalha
 * o DTO cru pelas telas.
 */
export interface StageSlice {
	key: string
	count: number
}

export interface JobSla {
	/** Régua configurada na vaga, em horas. null = anti-ghosting não configurado. */
	ruleHours: number | null
	/** Há quanto tempo está irregular (ms). null = dentro do prazo. */
	breachedForMs: number | null
}

export interface JobRow {
	id: string
	title: string
	/**
	 * Referência visível da vaga: o identificador externo (Gupy/ERP) quando
	 * existe; senão o id interno, pra o slot nunca ficar vazio.
	 */
	reference: string
	/** true = veio do identificador externo; false = id interno (renderizado com #). */
	referenceIsExternal: boolean
	meta: string
	level: string | null
	segment: string | null
	language: string | null
	location: string | null
	/** interview | evaluation | emotional | exitJob — diz QUE tipo de vaga é. */
	interviewType: string | null
	/** Listada na careers page pública. */
	isPublic: boolean
	status: JobStatus
	priority: boolean
	totalCandidates: number
	stages: StageSlice[]
	/** Tempo médio parado por etapa, em dias — a trilha da vaga. */
	trail: StageSlice[]
	openForDays: number | null
	sla: JobSla
	creator: string
}


export function statusOf(job: JobDto): JobStatus {
	if (job.archived) return 'arquivada'
	if (job.stopped) return 'pausada'
	return 'aberta'
}

function daysSince(iso: string | null | undefined): number | null {
	if (!iso) return null
	const t = new Date(iso).getTime()
	if (Number.isNaN(t)) return null
	return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function toStages(counts: Record<string, number> | undefined): StageSlice[] {
	if (!counts) return []
	// Soma por chave NORMALIZADA: `Approved` e `approved` são a mesma etapa.
	const merged = new Map<string, number>()
	for (const [rawKey, count] of Object.entries(counts)) {
		if (count <= 0) continue
		const key = normalizeStageKey(rawKey)
		merged.set(key, (merged.get(key) ?? 0) + count)
	}
	return [...merged.entries()]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => stageOrder(a.key) - stageOrder(b.key))
}

/**
 * SLA de resposta (anti-ghosting, TOS-026). Três estados possíveis:
 *  - sem régua  → anti-ghosting não configurado na vaga
 *  - dentro     → mostra a régua configurada ("24h")
 *  - estourado  → `slaIrregularSince` preenchido: mostra HÁ QUANTO TEMPO está
 *                 irregular, que é a informação acionável pro recrutador
 */
function toSla(job: JobDto): JobSla {
	const enabled = job.antiGhostingEnabled !== false
	const ruleHours = enabled ? (job.feedbackSlaHours ?? null) : null
	const since = job.slaIrregularSince ? new Date(job.slaIrregularSince).getTime() : null
	const breachedForMs = since && !Number.isNaN(since) ? Math.max(0, Date.now() - since) : null
	return { ruleHours, breachedForMs }
}

/** "informational_tecnology" → "Informational tecnology". Valores já escritos por extenso passam intactos. */
function humanize(value: string | null | undefined): string | null {
	const raw = value?.trim()
	if (!raw) return null
	if (!raw.includes('_')) return raw
	const spaced = raw.replace(/_/g, ' ').toLowerCase()
	return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function toJobRow(job: JobDto): JobRow {
	const metaParts = [job.carrerLevel, job.address?.city].filter(
		(part): part is string => typeof part === 'string' && part.trim() !== '' && part.trim() !== '-',
	)
	const location = [job.address?.city, job.address?.state].filter(Boolean).join(', ')
	return {
		id: job.id,
		title: job.jobName,
		reference: job.identifier?.trim() || job.id,
		referenceIsExternal: Boolean(job.identifier?.trim()),
		meta: metaParts.join(' · '),
		level: humanize(job.carrerLevel),
		segment: humanize(job.jobCategories),
		language: job.language?.trim().slice(0, 2).toLowerCase() || null,
		interviewType: job.typeInterview?.trim() || null,
		location: location && location !== '-' ? location : null,
		isPublic: job.public === true,
		status: statusOf(job),
		priority: Boolean(job.priority),
		totalCandidates: job.totalCandidates,
		stages: toStages(job.stageCounts),
		trail: toStages(job.stageDays),
		openForDays: daysSince(job.timeCreated),
		sla: toSla(job),
		creator: job.creatorName ?? '—',
	}
}

/** "1d 2h" / "4h" / "35min" — compacto, pro que cabe numa célula. */
export function formatDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000)
	if (totalMinutes < 60) return `${totalMinutes}min`
	const hours = Math.floor(totalMinutes / 60)
	if (hours < 24) return `${hours}h`
	const days = Math.floor(hours / 24)
	const restHours = hours % 24
	return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`
}
