import { asc, count, gte, inArray, sql, type Column } from 'drizzle-orm'
import type { JobApplied, CompanyInterview, PublicInterview, CandidateLike } from '@coploy/domain'
import type { CandidateRepository } from '../../../interfaces/repositories/candidate-repository'
import type { DrizzleDb } from '../db/client'
import {
	CandidateLikeRepositorySchema,
	CompanyInterviewRepositorySchema,
	JobAppliedRepositorySchema,
	PublicInterviewRepositorySchema,
} from '../../shared/repository-schemas'
import {
	and, applyPatch,
	buildListParams, cleanForDb, castWithSchema, eq, postProcess,
	randomUUID, schema, stripInternal, toJsonSafe,
} from './helpers'

// ─── Drizzle inferred row types ─────────────────────────────────────────────

type JobAppliedRow = typeof schema.jobsApplied.$inferSelect
type InterviewAnswerRow = typeof schema.interviewAnswers.$inferSelect
type AdditionalAnswerRow = typeof schema.additionalAnswers.$inferSelect
type CompanyInterviewViewRow = typeof schema.companyInterviewsView.$inferSelect
type PublicInterviewViewRow = typeof schema.publicInterviewsView.$inferSelect
type CandidateLikeRow = typeof schema.candidateLikes.$inferSelect

/** Query result shape from findFirst/findMany with jaWith() relations */
type JobAppliedWithRelations = JobAppliedRow & {
	interviewResult: Record<string, unknown> | null
	avaliacaoFinal: Record<string, unknown> | null
	batchProcessing: Record<string, unknown> | null
	exitJobResult: Record<string, unknown> | null
	answers: InterviewAnswerRow[]
	additionalAnswers: AdditionalAnswerRow[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert PgNumeric string value to number */
function parseNumeric(v: string | null | undefined): number | null {
	if (v == null) return null
	const n = Number.parseFloat(v)
	return Number.isFinite(n) ? n : null
}

const JA_WA_KEYS = new Set([
	'whatsappFeedbackGeral', 'whatsappPorcentagemMatch', 'whatsappRecomendacao',
	'whatsappRequisitosAtendidos', 'whatsappRequisitosNaoAtendidos', 'whatsappPontosAtencao',
])

function jaWith() {
	return {
		interviewResult: true as const,
		avaliacaoFinal: true as const,
		batchProcessing: true as const,
		exitJobResult: true as const,
		answers: { orderBy: [asc(schema.interviewAnswers.sort_order)] },
		additionalAnswers: { orderBy: [asc(schema.additionalAnswers.sort_order)] },
	}
}

// ─── Mappers (flat DB → domain) ─────────────────────────────────────────────

/** Maps a Drizzle jobsApplied row (with relations) to the domain JobApplied shape */
function mapJobAppliedFromRow(raw: JobAppliedWithRelations): JobApplied {
	// Build interview sub-object from answers + additionalAnswers + interviewResult
	const interview: Record<string, unknown> = {}
	if (raw.answers?.length) {
		interview.info = raw.answers.map((a) =>
			stripInternal(postProcess(schema.interviewAnswers, a as Record<string, unknown>), 'job_applied_id', 'sort_order'),
		)
	}
	if (raw.additionalAnswers?.length) {
		interview.addicional = raw.additionalAnswers.map((a) =>
			stripInternal(postProcess(schema.additionalAnswers, a as Record<string, unknown>), 'job_applied_id', 'sort_order'),
		)
	}
	if (raw.interviewResult && typeof raw.interviewResult === 'object') {
		Object.assign(interview, stripInternal(postProcess(schema.interviewResults, raw.interviewResult as Record<string, unknown>), 'job_applied_id'))
	}

	// Build whatsappTriagemResult from flat WA columns
	let whatsappTriagemResult: Record<string, unknown> | null = null
	if ([...JA_WA_KEYS].some((k) => (raw as Record<string, unknown>)[k] != null)) {
		whatsappTriagemResult = {
			feedbackGeral: raw.whatsappFeedbackGeral,
			porcentagemMatch: parseNumeric(raw.whatsappPorcentagemMatch),
			recomendacao: raw.whatsappRecomendacao,
			requisitosAtendidos: raw.whatsappRequisitosAtendidos ?? [],
			requisitosNaoAtendidos: raw.whatsappRequisitosNaoAtendidos ?? [],
			pontosAtencao: raw.whatsappPontosAtencao ?? [],
		}
	}

	return {
		id: raw.id,
		finished: raw.finished,
		candidateStatus: raw.candidateStatus,
		isPracticing: raw.isPracticing,
		engineBatchId: raw.engineBatchId,
		engineBatchStatus: raw.engineBatchStatus,
		typeInterview: raw.typeInterview,
		appliedTime: raw.appliedTime,
		finishedTime: raw.finishedTime,
		dateSelect: raw.dateSelect,
		rejectionReasonCode: raw.rejectionReasonCode,
		rejectionReasonLabel: raw.rejectionReasonLabel,
		rejectionNote: raw.rejectionNote,
		rejectionFeedbackSentAt: raw.rejectionFeedbackSentAt,
		rejectionDecisionSource: raw.rejectionDecisionSource as JobApplied['rejectionDecisionSource'],
		rejectionDecidedByUserId: raw.rejectionDecidedByUserId,
		rejectionTaxonomyVersion: raw.rejectionTaxonomyVersion,
		rejectionEvidence: raw.rejectionEvidence,
		rejectionRiskFlags: raw.rejectionRiskFlags,
		ackSentAt: raw.ackSentAt,
		screeningKnockoutAnswers: (raw.screeningKnockoutAnswers as JobApplied['screeningKnockoutAnswers']) ?? null,
		screeningKnockoutResult: (raw.screeningKnockoutResult as JobApplied['screeningKnockoutResult']) ?? null,
		screeningKnockoutTreeSnapshot: (raw.screeningKnockoutTreeSnapshot as JobApplied['screeningKnockoutTreeSnapshot']) ?? null,
		otsAttestation: (raw.otsAttestation as JobApplied['otsAttestation']) ?? null,
		companyOwner: raw.company_id ? { id: raw.company_id } : null,
		jobApplied: raw.post_job_id ? { id: raw.post_job_id } : null,
		interview,
		whatsappTriagemResult,
		exitJobResult: raw.exitJobResult
			? stripInternal(postProcess(schema.exitJobResults, raw.exitJobResult as Record<string, unknown>), 'job_applied_id')
			: null,
		avaliacaoFinal: raw.avaliacaoFinal
			? stripInternal(postProcess(schema.avaliacaoFinal, raw.avaliacaoFinal as Record<string, unknown>), 'job_applied_id')
			: null,
		batchProcessing: raw.batchProcessing
			? stripInternal(postProcess(schema.batchProcessing, raw.batchProcessing as Record<string, unknown>), 'job_applied_id')
			: null,
		languageEvaluation: (raw.languageEvaluation as JobApplied['languageEvaluation']) ?? null,
	}
}

/** Maps a CompanyInterviewView row to the domain CompanyInterview shape */
function mapCompanyInterviewFromRow(row: CompanyInterviewViewRow): CompanyInterview {
	return {
		id: row.id ?? '',
		company_id: row.company_id,
		post_job_id: row.post_job_id,
		user_id: row.user_id,
		finished: row.finished,
		finish: row.finish,
		candidateStatus: row.candidateStatus,
		date: row.date,
		dateSelect: row.dateSelect,
		rejectionReasonCode: row.rejectionReasonCode,
		rejectionReasonLabel: row.rejectionReasonLabel,
		rejectionNote: row.rejectionNote,
		rejectionFeedbackSentAt: row.rejectionFeedbackSentAt,
		rejectionDecisionSource: row.rejectionDecisionSource as CompanyInterview['rejectionDecisionSource'],
		rejectionDecidedByUserId: row.rejectionDecidedByUserId,
		rejectionTaxonomyVersion: row.rejectionTaxonomyVersion,
		rejectionEvidence: row.rejectionEvidence,
		rejectionRiskFlags: row.rejectionRiskFlags,
		ackSentAt: row.ackSentAt,
		score: row.score,
		name: row.name,
		photo_url: row.photo_url,
		occupation: row.occupation,
		external_id: row.external_id,
		professionalExperience: row.professionalExperience,
		phone_number: row.phone_number,
		state: row.state,
		city: row.city,
		email: row.email,
		carrerLevel: row.carrerLevel,
		jobName: row.jobName,
		jobDescription: row.jobDescription,
		typeInterview: row.typeInterview,
		stopped: row.stopped,
		job_applied_ref: row.job_applied_ref as CompanyInterview['job_applied_ref'],
		user_ref: row.user_ref as CompanyInterview['user_ref'],
		job_ref: row.job_ref as CompanyInterview['job_ref'],
	}
}

/** Maps a PublicInterviewView row to the domain PublicInterview shape */
function mapPublicInterviewFromRow(row: PublicInterviewViewRow): PublicInterview {
	return {
		id: row.id ?? '',
		company_id: row.company_id,
		date: row.date,
		email: row.email,
		external_id: row.external_id,
		jobName: row.jobName,
		name: row.name,
		occupation: row.occupation,
		phone_number: row.phone_number,
		photo_url: row.photo_url,
		professionalExperience: row.professionalExperience,
		score: row.score,
		state: row.state,
		city: row.city,
		carrerLevel: row.carrerLevel,
		typeInterview: row.typeInterview,
		academic: row.academic,
		job_applied_ref: row.job_applied_ref as PublicInterview['job_applied_ref'],
		job_ref: row.job_ref as PublicInterview['job_ref'],
		user_ref: row.user_ref as PublicInterview['user_ref'],
	}
}

/** Maps a CandidateLike row to the domain CandidateLike shape */
function mapCandidateLikeFromRow(row: CandidateLikeRow): CandidateLike {
	return {
		id: row.id,
		user_id: row.user_id,
		name: row.name,
		avatar_url: row.avatar_url,
		email: row.email,
		action: row.action,
		created_at: row.created_at,
	}
}

// ─── Mappers (domain → flat DB for writes) ──────────────────────────────────

function decomposeJobApplied(doc: Record<string, unknown>): {
	main: Record<string, unknown>; interviewAnswers: Record<string, unknown>[]
	additionalAnswers: Record<string, unknown>[]; interviewResults: Record<string, unknown> | null
	avaliacaoFinal: Record<string, unknown> | null; batchProcessing: Record<string, unknown> | null
	exitJobResult: Record<string, unknown> | null
} {
	const main: Record<string, unknown> = {}
	let interviewAnswers: Record<string, unknown>[] = []
	let additionalAnswers: Record<string, unknown>[] = []
	let interviewResults: Record<string, unknown> | null = null
	let avaliacaoFinal: Record<string, unknown> | null = null
	let batchProcessing: Record<string, unknown> | null = null
	let exitJobResult: Record<string, unknown> | null = null

	for (const [k, v] of Object.entries(doc)) {
		if (k === 'id') continue
		if (k === 'interview' && typeof v === 'object' && v && !Array.isArray(v)) {
			const iv = v as Record<string, unknown>
			if (Array.isArray(iv.info)) interviewAnswers = iv.info as Record<string, unknown>[]
			if (Array.isArray(iv.addicional)) additionalAnswers = iv.addicional as Record<string, unknown>[]
			const rest: Record<string, unknown> = {}
			for (const [ik, ivv] of Object.entries(iv)) if (ik !== 'info' && ik !== 'addicional') rest[ik] = ivv
			if (Object.keys(rest).length) interviewResults = rest
		} else if (k === 'avaliacaoFinal' && typeof v === 'object' && v) { avaliacaoFinal = v as Record<string, unknown> }
		else if (k === 'batchProcessing' && typeof v === 'object' && v) { batchProcessing = v as Record<string, unknown> }
		else if (k === 'exitJobResult' && typeof v === 'object' && v) { exitJobResult = v as Record<string, unknown> }
		else if (k === 'whatsappTriagemResult' && typeof v === 'object' && v) {
			const w = v as Record<string, unknown>
			main.whatsappFeedbackGeral = w.feedbackGeral; main.whatsappPorcentagemMatch = w.porcentagemMatch
			main.whatsappRecomendacao = w.recomendacao; main.whatsappRequisitosAtendidos = w.requisitosAtendidos ?? []
			main.whatsappRequisitosNaoAtendidos = w.requisitosNaoAtendidos ?? []; main.whatsappPontosAtencao = w.pontosAtencao ?? []
		} else if (k === 'companyOwner') { if (typeof v === 'object' && v) main.company_id = (v as Record<string, unknown>).id }
		else if (k === 'jobApplied') { if (typeof v === 'object' && v) main.post_job_id = (v as Record<string, unknown>).id }
		else { main[k] = v }
	}
	return { main, interviewAnswers, additionalAnswers, interviewResults, avaliacaoFinal, batchProcessing, exitJobResult }
}

async function writeJobApplied(db: DrizzleDb, id: string, doc: Record<string, unknown>, userId: string, isCreate: boolean) {
	const d = decomposeJobApplied(doc)
	d.main.user_id = userId
	const cleaned = cleanForDb(schema.jobsApplied, d.main)
	if (isCreate) {
		await db.insert(schema.jobsApplied).values({ id, ...cleaned } as typeof schema.jobsApplied.$inferInsert)
	} else {
		await db.update(schema.jobsApplied).set(cleaned as typeof schema.jobsApplied.$inferInsert).where(eq(schema.jobsApplied.id, id))
	}

	if (d.interviewAnswers.length || doc.interview !== undefined) {
		await db.delete(schema.interviewAnswers).where(eq(schema.interviewAnswers.job_applied_id, id))
		if (d.interviewAnswers.length) {
			await db.insert(schema.interviewAnswers).values(
				d.interviewAnswers.map((a, i) => ({ id: (a.id as string) ?? `q${i}`, job_applied_id: id, sort_order: i, ...cleanForDb(schema.interviewAnswers, a) } as typeof schema.interviewAnswers.$inferInsert)),
			)
		}
	}
	if (d.additionalAnswers.length || (doc.interview as Record<string, unknown>)?.addicional !== undefined) {
		await db.delete(schema.additionalAnswers).where(eq(schema.additionalAnswers.job_applied_id, id))
		if (d.additionalAnswers.length) {
			await db.insert(schema.additionalAnswers).values(
				d.additionalAnswers.map((a, i) => ({ id: (a.id as string) ?? `aq${i}`, job_applied_id: id, sort_order: i, ...cleanForDb(schema.additionalAnswers, a) } as typeof schema.additionalAnswers.$inferInsert)),
			)
		}
	}
	if (d.interviewResults) {
		const irData = cleanForDb(schema.interviewResults, d.interviewResults)
		await db.insert(schema.interviewResults).values({ id: `ir_${id}`, job_applied_id: id, ...irData } as typeof schema.interviewResults.$inferInsert)
			.onConflictDoUpdate({ target: schema.interviewResults.job_applied_id, set: irData as typeof schema.interviewResults.$inferInsert })
	}
	if (d.avaliacaoFinal) {
		const afData = cleanForDb(schema.avaliacaoFinal, d.avaliacaoFinal)
		await db.insert(schema.avaliacaoFinal).values({ id: `af_${id}`, job_applied_id: id, ...afData } as typeof schema.avaliacaoFinal.$inferInsert)
			.onConflictDoUpdate({ target: schema.avaliacaoFinal.job_applied_id, set: afData as typeof schema.avaliacaoFinal.$inferInsert })
	}
	if (d.batchProcessing) {
		const bpData = cleanForDb(schema.batchProcessing, d.batchProcessing)
		await db.insert(schema.batchProcessing).values({ id: `bp_${id}`, job_applied_id: id, ...bpData } as typeof schema.batchProcessing.$inferInsert)
			.onConflictDoUpdate({ target: schema.batchProcessing.job_applied_id, set: bpData as typeof schema.batchProcessing.$inferInsert })
	}
	if (d.exitJobResult) {
		const ejrData = cleanForDb(schema.exitJobResults, d.exitJobResult)
		await db.insert(schema.exitJobResults).values({ id: `ejr_${id}`, job_applied_id: id, ...ejrData } as typeof schema.exitJobResults.$inferInsert)
			.onConflictDoUpdate({ target: schema.exitJobResults.job_applied_id, set: ejrData as typeof schema.exitJobResults.$inferInsert })
	}
}

// ─── Field maps for buildListParams ─────────────────────────────────────────

const JA_FIELD_MAP = {
	'companyOwner.id': schema.jobsApplied.company_id,
	'jobApplied.id': schema.jobsApplied.post_job_id,
}

const VIEW_FIELD_MAP = {
	candidate_status: schema.companyInterviewsView.candidateStatus,
	date_select: schema.companyInterviewsView.dateSelect,
	'user_ref.id': schema.companyInterviewsView.user_id,
	'job_ref.id': schema.companyInterviewsView.post_job_id,
	job_ref: schema.companyInterviewsView.post_job_id,
	'job_applied_ref.id': schema.companyInterviewsView.id as Column,
}

const PUBLIC_FIELD_MAP = {
	type_interview: schema.publicInterviewsView.typeInterview,
}

// ─── Repository implementation ──────────────────────────────────────────────

export function createDrizzleCandidateRepository(db: DrizzleDb): CandidateRepository {
	return {
		async getJobApplied(_userId, jobAppliedId) {
			const row = await db.query.jobsApplied.findFirst({
				where: eq(schema.jobsApplied.id, jobAppliedId),
				with: jaWith(),
			})
			if (!row) return null
			return castWithSchema<JobApplied>(mapJobAppliedFromRow(row as unknown as JobAppliedWithRelations), JobAppliedRepositorySchema)
		},

		async listJobsApplied(userId, options) {
			const staticConds = [eq(schema.jobsApplied.user_id, userId)]
			const { where, orderBy, limit } = buildListParams(schema.jobsApplied, JA_FIELD_MAP, staticConds, options)
			const rows = await db.query.jobsApplied.findMany({
				where, orderBy: orderBy ? [orderBy] : undefined, limit, with: jaWith(),
			})
			return rows.map((r) => castWithSchema<JobApplied>(mapJobAppliedFromRow(r as unknown as JobAppliedWithRelations), JobAppliedRepositorySchema))
		},

		async createJobApplied(userId, data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			await writeJobApplied(db, id, payload, userId, true)
			return { ...data, id } as JobApplied & { id: string }
		},

		async updateJobApplied(_userId, id, data) {
			const current = await db.query.jobsApplied.findFirst({ where: eq(schema.jobsApplied.id, id), with: jaWith() })
			if (!current) return
			const assembled = mapJobAppliedFromRow(current as unknown as JobAppliedWithRelations) as unknown as Record<string, unknown>
			const patched = applyPatch(assembled, data as Record<string, unknown>)
			await writeJobApplied(db, id, patched, current.user_id, false)
		},

		async updateJobAppliedInTransaction(userId, id, updateFn) {
			// PostgreSQL já tem row-level locking nativo, serializar via read+write
			const current = await db.query.jobsApplied.findFirst({ where: eq(schema.jobsApplied.id, id), with: jaWith() })
			if (!current) throw new Error(`JobApplied ${id} not found for user ${userId}`)
			const assembled = mapJobAppliedFromRow(current as unknown as JobAppliedWithRelations)
			const updates = updateFn(assembled as unknown as JobApplied)
			const patched = applyPatch(assembled as unknown as Record<string, unknown>, updates as Record<string, unknown>)
			await writeJobApplied(db, id, patched, current.user_id, false)
		},

		async setJobApplied(userId, id, data) {
			const current = await db.query.jobsApplied.findFirst({ where: eq(schema.jobsApplied.id, id), with: jaWith() })
			const assembled = current ? mapJobAppliedFromRow(current as unknown as JobAppliedWithRelations) as unknown as Record<string, unknown> : {}
			const patched = applyPatch(assembled, data as Record<string, unknown>)
			const effectiveUserId = current?.user_id ?? userId
			await writeJobApplied(db, id, patched, effectiveUserId, !current)
		},

		async listCompanyInterviews(companyId, options) {
			const staticConds = [eq(schema.companyInterviewsView.company_id as Column, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.companyInterviewsView, VIEW_FIELD_MAP, staticConds, options)
			let query = db.select().from(schema.companyInterviewsView).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<CompanyInterview>(mapCompanyInterviewFromRow(r as CompanyInterviewViewRow), CompanyInterviewRepositorySchema),
			)
		},

		async countCompanyInterviews(companyId, filters) {
			const conds = [eq(schema.companyInterviewsView.company_id as Column, companyId)]
			if (filters?.finished === true) {
				conds.push(eq(schema.companyInterviewsView.finished as Column, true))
			}
			if (filters?.dateGte) {
				conds.push(gte(schema.companyInterviewsView.date as Column, filters.dateGte))
			}
			const [row] = await db
				.select({ value: count() })
				.from(schema.companyInterviewsView)
				.where(and(...conds))
			return row?.value ?? 0
		},

		async listAdminCandidateSummaries() {
			throw new Error('[selfhosted] adminCandidateSummaries not implemented — use GCP adapter for admin console')
		},

		async getAdminCandidateSummary() {
			throw new Error('[selfhosted] adminCandidateSummaries not implemented — use GCP adapter for admin console')
		},

		async findAdminCandidateSummariesByExact() {
			throw new Error('[selfhosted] adminCandidateSummaries not implemented — use GCP adapter for admin console')
		},

		async searchAdminCandidateSummariesByKeyword() {
			throw new Error('[selfhosted] adminCandidateSummaries not implemented — use GCP adapter for admin console')
		},

		async countAdminCandidateSummaries() {
			throw new Error('[selfhosted] adminCandidateSummaries not implemented — use GCP adapter for admin console')
		},

		async syncAdminCandidateSummaryInterview() {
			// No-op no selfhosted por enquanto: a tela admin cross-company é GCP-only.
		},

		async listCompanyInterviewsForBackfill() {
			throw new Error('[selfhosted] listCompanyInterviewsForBackfill not implemented — use GCP adapter for admin console')
		},

		async getCompanyInterview(companyId, interviewId) {
			const rows = await db.select().from(schema.companyInterviewsView)
				.where(and(
					eq(schema.companyInterviewsView.company_id as Column, companyId),
					eq(schema.companyInterviewsView.id as Column, interviewId),
				))
				.limit(1)
			if (!rows.length) return null
			const mapped = castWithSchema<CompanyInterview>(
				mapCompanyInterviewFromRow(rows[0] as CompanyInterviewViewRow),
				CompanyInterviewRepositorySchema,
			)
			return { ...mapped, id: interviewId } as CompanyInterview & { id: string }
		},

		async listJobInterviews(companyId, jobId, options) {
			const staticConds = [
				eq(schema.companyInterviewsView.company_id as Column, companyId),
				eq(schema.companyInterviewsView.post_job_id as Column, jobId),
			]
			const { where, orderBy, limit } = buildListParams(schema.companyInterviewsView, VIEW_FIELD_MAP, staticConds, options)
			let query = db.select().from(schema.companyInterviewsView).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<CompanyInterview>(mapCompanyInterviewFromRow(r as CompanyInterviewViewRow), CompanyInterviewRepositorySchema),
			)
		},

		async listAllCompanyInterviews() {
			throw new Error('[selfhosted] listAllCompanyInterviews not implemented — use GCP adapter for admin console')
		},

		async listPublicInterviews(options) {
			const { where, orderBy, limit } = buildListParams(schema.publicInterviewsView, PUBLIC_FIELD_MAP, [], options)
			let query = db.select().from(schema.publicInterviewsView).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<PublicInterview>(mapPublicInterviewFromRow(r as PublicInterviewViewRow), PublicInterviewRepositorySchema),
			)
		},

		async listPublicInterviewsByUsers(userIds) {
			const unicos = [...new Set(userIds.filter(Boolean))]
			if (unicos.length === 0) return []

			/*
			 * `user_ref` é JSONB aqui (a VIEW espelha o formato do Firestore), então
			 * o filtro compara o `id` de dentro do objeto. Sem operador tipado no
			 * Drizzle para isso, `sql` cru é o caminho — e o `inArray` fica sobre a
			 * expressão extraída.
			 */
			const rows = await db
				.select()
				.from(schema.publicInterviewsView)
				.where(inArray(sql`${schema.publicInterviewsView.user_ref}->>'id'`, unicos))

			return rows.map((r) =>
				castWithSchema<PublicInterview>(
					mapPublicInterviewFromRow(r as PublicInterviewViewRow),
					PublicInterviewRepositorySchema,
				),
			)
		},

		async upsertPublicInterview() {
			// No-op: `public_interviews` é uma VIEW derivada de `jobs_applied` (migrate.ts:826),
			// com filtro `subscriptionPlan != enterprise` e `typeInterview = 'interview'` aplicado
			// nativamente. Toda entrevista finalizada que se qualifica aparece automaticamente
			// no hunting dashboard sem precisar de escrita explícita.
		},
		async updatePublicInterview() {
			// No-op: VIEW resolve.
		},
		async getPublicInterview(id) {
			const rows = await db.select().from(schema.publicInterviewsView)
				.where(eq(schema.publicInterviewsView.id as Column, id))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<PublicInterview>(mapPublicInterviewFromRow(rows[0]), PublicInterviewRepositorySchema)
		},

		async listCandidateLikes(_userId, jobAppliedId) {
			const rows = await db.select().from(schema.candidateLikes)
				.where(eq(schema.candidateLikes.job_applied_id, jobAppliedId))
			return rows.map((r) => castWithSchema<CandidateLike>(mapCandidateLikeFromRow(r as CandidateLikeRow), CandidateLikeRepositorySchema))
		},

		async createCandidateLike(_userId, jobAppliedId, data) {
			const id = randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.candidateLikes, { ...payload, job_applied_id: jobAppliedId })
			await db.insert(schema.candidateLikes).values({ id, ...cleaned } as typeof schema.candidateLikes.$inferInsert)
			return { ...data, id } as CandidateLike & { id: string }
		},

		async deleteCandidateLike(_userId, _jobAppliedId, likeId) {
			await db.delete(schema.candidateLikes).where(eq(schema.candidateLikes.id, likeId))
		},

		async getJobInterview(companyId, jobId, interviewId) {
			const rows = await db.select().from(schema.companyInterviewsView)
				.where(and(
					eq(schema.companyInterviewsView.company_id as Column, companyId),
					eq(schema.companyInterviewsView.post_job_id as Column, jobId),
					eq(schema.companyInterviewsView.id as Column, interviewId),
				))
				.limit(1)
			if (!rows.length) return null
			const row = rows[0]
			const mapped = mapCompanyInterviewFromRow(row) as unknown as Record<string, unknown>
			mapped.user_ref = { id: row.user_id, path: `users/${row.user_id}` }
			mapped.job_applied_ref = { id: row.id, path: `users/${row.user_id}/jobsApplied/${row.id}` }
			return castWithSchema<JobApplied>(mapped, JobAppliedRepositorySchema)
		},
		async setJobInterview(_companyId, _jobId, _interviewId, _data) {
			// view is auto-computed from jobs_applied in PostgreSQL
		},
		async updateJobInterview(_companyId, _jobId, _interviewId, _data) {
			// view is auto-computed from jobs_applied in PostgreSQL
		},
		async setCompanyInterview(_companyId, _interviewId, _data) {
			// view is auto-computed from jobs_applied in PostgreSQL
		},
		async updateCompanyInterview(_companyId, _interviewId, _data) {
			// view is auto-computed from jobs_applied in PostgreSQL
		},
		async deleteJobApplied(_userId, id) {
			// CASCADE deletes child tables (interview_answers, interview_results, etc.)
			await db.delete(schema.jobsApplied).where(eq(schema.jobsApplied.id, id))
		},
		async deleteJobInterview(_companyId, _jobId, _interviewId) {
			// view is auto-computed from jobs_applied in PostgreSQL — CASCADE handles cleanup
		},
		async deleteCompanyInterview(_companyId, _interviewId) {
			// view is auto-computed from jobs_applied in PostgreSQL — CASCADE handles cleanup
		},
	}
}
