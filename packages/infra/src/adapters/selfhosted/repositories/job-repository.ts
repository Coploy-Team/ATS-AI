import { asc, desc } from 'drizzle-orm'
import type { PostJob, InfoJob, JobPortal } from '@coploy/domain'
import type { JobRepository } from '../../../interfaces/repositories/job-repository'
import { extractRefId } from '../../shared/ref-utils'
import { PostJobRepositorySchema } from '../../shared/repository-schemas'
import type { DrizzleDb } from '../db/client'
import {
	and, applyPatch,
	buildListParams, cleanForDb, castWithSchema, eq,
	randomUUID, schema, toJsonSafe,
} from './helpers'

// ─── Drizzle inferred row types ─────────────────────────────────────────────

type PostJobRow = typeof schema.postJobs.$inferSelect
type PostJobQuestionRow = typeof schema.postJobQuestions.$inferSelect
type PostJobAdditionalQuestionRow = typeof schema.postJobAdditionalQuestions.$inferSelect
type InfoJobRow = typeof schema.infoJobs.$inferSelect
type JobPortalRow = typeof schema.jobPortal.$inferSelect

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert PgNumeric string value to number (matches postProcess behavior) */
function parseNumeric(v: string | null): number | null {
	if (v == null) return null
	const n = Number.parseFloat(v)
	return Number.isFinite(n) ? n : null
}

// ─── Mappers (flat DB → domain) ─────────────────────────────────────────────

function mapQuestionFromRow(row: PostJobQuestionRow | PostJobAdditionalQuestionRow) {
	return {
		question: row.question,
		audioUrl: row.audioUrl,
		level: row.level,
		peso: parseNumeric(row.peso),
		skills: row.skills,
		finish: row.finish,
	}
}

/** Maps flat DB rows to the domain PostJob shape (flat → nested) */
function mapPostJobFromRow(
	row: PostJobRow,
	questions: PostJobQuestionRow[],
	additionalQuestions: PostJobAdditionalQuestionRow[],
): PostJob {
	return {
		id: row.id,
		jobId: row.jobId,
		jobName: row.jobName,
		identifier: row.identifier,
		jobDescription: row.jobDescription,
		employmentType: row.employmentType,
		carrerLevel: row.carrerLevel,
		language: row.language,
		typeInterview: row.typeInterview,
		interviewMode: (row.interviewMode as 'video' | 'voice' | 'whatsapp' | null | undefined) ?? null,
		evaluateLanguage: row.evaluateLanguage ?? false,
		profileInterview: row.profileInterview ?? false,
		// os 9 campos que ficaram sem coluna até a migration 0045 — a leitura
		// precisa acompanhar, senão a gravação volta a sumir só que na volta
		kanbanConfig: (row.kanbanConfig as PostJob['kanbanConfig']) ?? null,
		evaluation: (row.evaluation as PostJob['evaluation']) ?? null,
		competencias_criticas: row.competencias_criticas ?? null,
		competencias_adicionais: row.competencias_adicionais ?? null,
		expectativas: row.expectativas ?? null,
		hiringIntent: (row.hiringIntent as PostJob['hiringIntent']) ?? null,
		freshnessSlaDays: row.freshnessSlaDays ?? null,
		lastActivityAt: row.lastActivityAt ?? null,
		freshnessPausedAt: row.freshnessPausedAt ?? null,
		antiGhostingEnabled: row.antiGhostingEnabled ?? null,
		feedbackSlaHours: row.feedbackSlaHours ?? null,
		slaIrregularSince: row.slaIrregularSince ?? null,
		slaAlertSentAt: row.slaAlertSentAt ?? null,
		slaAutoStoppedAt: row.slaAutoStoppedAt ?? null,
		slaAutoStoppedByAntiGhosting: row.slaAutoStoppedByAntiGhosting ?? null,
		slaPublicBeforeAutoStop: row.slaPublicBeforeAutoStop ?? null,
		jobResponsabilities: row.jobResponsabilities,
		jobResponsibilities: row.jobResponsibilities,
		jobRequirements: row.jobRequirements,
		structuredRequirements: row.structuredRequirements as PostJob['structuredRequirements'],
		knockoutTree: row.knockoutTree as PostJob['knockoutTree'],
		jobCategories: row.jobCategories,
		jobModel: row.jobModel,
		jobHours: row.jobHours,
		companyName: row.companyName,
		creatorId: row.creatorId,
		creatorName: row.creatorName,
		creatorEmail: row.creatorEmail,
		contractType: row.contractType,
		screeningObjective: row.screeningObjective,
		workModality: row.workModality,
		mainSkills: row.mainSkills,
		generatedJobDescription: row.generatedJobDescription,
		limitNumberJobVacancies: row.limitNumberJobVacancies,
		stopped: row.stopped,
		archived: row.archived,
		public: row.public,
		priority: row.priority,
		limitedJobVacancy: row.limitedJobVacancy,
		infoJobsBool: row.infoJobsBool,
		requiresPreviousExperience: row.requiresPreviousExperience,
		minimumAge: row.minimumAge,
		timeCreated: row.timeCreated,
		closingDate: row.closingDate,
		educationalRequiements: row.educationalRequiements,
		benefits: row.benefits ?? null,
		salary: row.salary ?? null,
		/*
		 * O mapeamento aqui é campo a campo (não passthrough), então coluna nova
		 * que não aparece nesta lista é gravada e some na leitura — silenciosamente.
		 */
		orgUnitId: row.orgUnitId,
		customFieldValues: row.customFieldValues as Record<string, unknown> | null,
		// flat → nested
		address: {
			state: row.addressState ?? null,
			country: row.addressCountry ?? null,
			city: row.addressCity ?? null,
		},
		jobDescriptionMetadata: {
			companyDescription: row.jdMetaCompanyDescription ?? null,
			contractType: row.jdMetaContractType ?? null,
			benefits: row.jdMetaBenefits ?? null,
			salary: row.jdMetaSalary ?? null,
			generatedAt: row.jdMetaGeneratedAt ?? null,
			generatedBy: row.jdMetaGeneratedBy ?? null,
		},
		uid: row.creatorUserCompanyId ? { id: row.creatorUserCompanyId } : null,
		infoJobs: row.infoJobId ? { id: row.infoJobId } : null,
		uid_notification_message: row.notificationMessageId ? { id: row.notificationMessageId } : null,
		// child tables
		jobQuestions: questions.map(mapQuestionFromRow),
		additionalQuestions: additionalQuestions.map(mapQuestionFromRow),
	}
}

/** Decomposes a domain PostJob doc back to flat DB columns + child arrays (nested → flat) */
function mapPostJobToRow(doc: Record<string, unknown>): {
	main: Record<string, unknown>
	questions: Record<string, unknown>[]
	additionalQuestions: Record<string, unknown>[]
} {
	const main: Record<string, unknown> = {}
	let questions: Record<string, unknown>[] = []
	let additionalQuestions: Record<string, unknown>[] = []

	for (const [k, v] of Object.entries(doc)) {
		if (k === 'id') continue
		if (k === 'jobQuestions' && Array.isArray(v)) { questions = v; continue }
		if (k === 'additionalQuestions' && Array.isArray(v)) { additionalQuestions = v; continue }

		// nested → flat
		if (k === 'address' && typeof v === 'object' && v) {
			const a = v as Record<string, unknown>
			main.addressState = a.state
			main.addressCountry = a.country
			main.addressCity = a.city
			continue
		}
		if (k === 'jobDescriptionMetadata' && typeof v === 'object' && v) {
			const m = v as Record<string, unknown>
			main.jdMetaCompanyDescription = m.companyDescription
			main.jdMetaContractType = m.contractType
			main.jdMetaBenefits = m.benefits
			main.jdMetaSalary = m.salary
			main.jdMetaGeneratedAt = m.generatedAt
			main.jdMetaGeneratedBy = m.generatedBy
			continue
		}
		if (k === 'uid') {
			const id = extractRefId(v)
			if (id) main.creatorUserCompanyId = id
			continue
		}
		if (k === 'infoJobs') {
			const id = extractRefId(v)
			if (id) main.infoJobId = id
			continue
		}
		if (k === 'uid_notification_message') {
			const id = extractRefId(v)
			if (id) main.notificationMessageId = id
			continue
		}
		// Skip Firestore-only denormalized fields
		if (k === 'usersApplied' || k === 'interviews') continue

		main[k] = v
	}

	return { main, questions, additionalQuestions }
}

/** Maps a flat DB row to the domain InfoJob shape */
function mapInfoJobFromRow(row: InfoJobRow): InfoJob {
	return {
		id: row.id,
		name: row.name,
		finishText: row.finishText,
		finishVideo: row.finishVideo,
		welcomeText: row.welcomeText,
		welcomeVideo: row.welcomeVideo,
	}
}

/** Maps a flat DB row to the domain JobPortal shape */
function mapJobPortalFromRow(row: JobPortalRow): JobPortal {
	return {
		id: row.id,
		company_id: row.company_id,
		bannerUrl: row.bannerUrl,
		bannerPosition: row.bannerPosition,
		socialLinks: row.socialLinks as JobPortal['socialLinks'],
		defaultDomainUrl: row.defaultDomainUrl,
		logoUrl: row.logoUrl,
		primaryColor: row.primaryColor,
		textColor: row.textColor,
		isProfileVisible: row.isProfileVisible,
		about: row.about ?? null,
		videoUrl: row.videoUrl ?? null,
	}
}

// ─── Relation config for PostJob queries ────────────────────────────────────

function pjWith() {
	return {
		questions: { orderBy: [asc(schema.postJobQuestions.sort_order)] },
		additionalQuestions: { orderBy: [asc(schema.postJobAdditionalQuestions.sort_order)] },
	}
}

// ─── Write helper (handles child table sync) ────────────────────────────────

async function writePostJob(db: DrizzleDb, id: string, doc: Record<string, unknown>, companyId: string, isCreate: boolean) {
	const { main, questions, additionalQuestions } = mapPostJobToRow(doc)
	main.company_id = companyId
	const cleaned = cleanForDb(schema.postJobs, main)
	if (isCreate) {
		await db.insert(schema.postJobs).values({ id, ...cleaned } as typeof schema.postJobs.$inferInsert)
	} else {
		await db.update(schema.postJobs).set(cleaned as typeof schema.postJobs.$inferInsert).where(eq(schema.postJobs.id, id))
	}
	await db.delete(schema.postJobQuestions).where(eq(schema.postJobQuestions.post_job_id, id))
	if (questions.length) {
		await db.insert(schema.postJobQuestions).values(
			questions.map((q, i) => ({ id: typeof q.id === 'string' && q.id ? q.id : `q${i}`, post_job_id: id, sort_order: i, ...cleanForDb(schema.postJobQuestions, q) } as typeof schema.postJobQuestions.$inferInsert)),
		)
	}
	await db.delete(schema.postJobAdditionalQuestions).where(eq(schema.postJobAdditionalQuestions.post_job_id, id))
	if (additionalQuestions.length) {
		await db.insert(schema.postJobAdditionalQuestions).values(
			additionalQuestions.map((q, i) => ({ id: typeof q.id === 'string' && q.id ? q.id : `aq${i}`, post_job_id: id, sort_order: i, ...cleanForDb(schema.postJobAdditionalQuestions, q) } as typeof schema.postJobAdditionalQuestions.$inferInsert)),
		)
	}
}

/** Field map for query filters (dot-notation → DB column) */
const PJ_FIELD_MAP = {
	'address.state': schema.postJobs.addressState,
	'address.country': schema.postJobs.addressCountry,
	'address.city': schema.postJobs.addressCity,
	'uid.id': schema.postJobs.creatorUserCompanyId,
	'infoJobs.id': schema.postJobs.infoJobId,
}

// ─── Repository ─────────────────────────────────────────────────────────────

export function createDrizzleJobRepository(db: DrizzleDb): JobRepository {
	return {
		async getJob(companyId, jobId) {
			const row = await db.query.postJobs.findFirst({
				where: and(eq(schema.postJobs.id, jobId), eq(schema.postJobs.company_id, companyId)),
				with: pjWith(),
			})
			if (!row) return null
			return castWithSchema<PostJob>(
				mapPostJobFromRow(row, row.questions, row.additionalQuestions),
				PostJobRepositorySchema,
			)
		},

		async listJobs(companyId, options) {
			const staticConds = [eq(schema.postJobs.company_id, companyId)]
			const { where, orderBy, orderByList, limit } = buildListParams(schema.postJobs, PJ_FIELD_MAP, staticConds, options)
			const finalOrderBy = orderByList ?? (orderBy ? [orderBy] : undefined)
			const rows = await db.query.postJobs.findMany({
				where, orderBy: finalOrderBy, limit, with: pjWith(),
			})
			return rows.map((r) => castWithSchema<PostJob>(
				mapPostJobFromRow(r, r.questions, r.additionalQuestions),
				PostJobRepositorySchema,
			))
		},

		async listPublicJobs(options) {
			const limit = options?.limit ?? 200
			const rows = await db.query.postJobs.findMany({
				where: eq(schema.postJobs.public, true),
				orderBy: [desc(schema.postJobs.timeCreated)],
				limit,
				with: pjWith(),
			})
			return rows.map((r) => ({
				...castWithSchema<PostJob>(
					mapPostJobFromRow(r, r.questions, r.additionalQuestions),
					PostJobRepositorySchema,
				),
				companyId: r.company_id,
			}))
		},

		async listPublicJobsByCompany(companyId, options) {
			const limit = options?.limit ?? 200
			const rows = await db.query.postJobs.findMany({
				where: and(eq(schema.postJobs.company_id, companyId), eq(schema.postJobs.public, true)),
				orderBy: [desc(schema.postJobs.timeCreated)],
				limit,
				with: pjWith(),
			})
			return rows.map((r) => castWithSchema<PostJob>(
				mapPostJobFromRow(r, r.questions, r.additionalQuestions),
				PostJobRepositorySchema,
			))
		},
		async createJob(companyId, data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			await writePostJob(db, id, payload, companyId, true)
			return { ...payload, id }
		},

		async updateJob(companyId, jobId, data) {
			const current = await db.query.postJobs.findFirst({
				where: and(eq(schema.postJobs.id, jobId), eq(schema.postJobs.company_id, companyId)),
				with: pjWith(),
			})
			if (!current) return
			const assembled = mapPostJobFromRow(current, current.questions, current.additionalQuestions) as unknown as Record<string, unknown>
			const patched = applyPatch(assembled, data)
			await writePostJob(db, jobId, patched, companyId, false)
		},

		async syncPostJobUsersApplied(_companyId, _jobId, _userId) {
			// usersApplied is a Firestore-only denormalized field. In PostgreSQL,
			// candidate linkage comes from jobs_applied and derived interview views.
		},

		async getInfoJobByPostJob(companyId, jobId) {
			const postRows = await db
				.select({ infoJobId: schema.postJobs.infoJobId })
				.from(schema.postJobs)
				.where(and(eq(schema.postJobs.id, jobId), eq(schema.postJobs.company_id, companyId)))
				.limit(1)

			const infoJobId = postRows[0]?.infoJobId
			if (!infoJobId) return null

			const infoRows = await db.select().from(schema.infoJobs)
				.where(and(eq(schema.infoJobs.id, infoJobId), eq(schema.infoJobs.company_id, companyId)))
				.limit(1)
			if (!infoRows.length) return null

			return mapInfoJobFromRow(infoRows[0])
		},

		async deleteJob(_companyId, jobId) {
			await db.delete(schema.postJobs).where(eq(schema.postJobs.id, jobId))
		},

		async listInfoJobs(companyId) {
			const rows = await db.select().from(schema.infoJobs).where(eq(schema.infoJobs.company_id, companyId))
			return rows.map(mapInfoJobFromRow)
		},

		async getInfoJob(companyId, id) {
			const rows = await db.select().from(schema.infoJobs)
				.where(and(eq(schema.infoJobs.id, id), eq(schema.infoJobs.company_id, companyId)))
				.limit(1)
			if (!rows.length) return null
			return mapInfoJobFromRow(rows[0])
		},

		async createInfoJob(companyId, data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.infoJobs, { ...payload, company_id: companyId })
			await db.insert(schema.infoJobs).values({ id, ...cleaned } as typeof schema.infoJobs.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async updateInfoJob(companyId, id, data) {
			const rows = await db.select().from(schema.infoJobs)
				.where(and(eq(schema.infoJobs.id, id), eq(schema.infoJobs.company_id, companyId)))
				.limit(1)
			if (!rows.length) return
			const current = mapInfoJobFromRow(rows[0]) as unknown as Record<string, unknown>
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.infoJobs, patched)
			await db.update(schema.infoJobs).set(cleaned as typeof schema.infoJobs.$inferInsert).where(eq(schema.infoJobs.id, id))
		},

		async deleteInfoJob(_companyId, id) {
			await db.delete(schema.infoJobs).where(eq(schema.infoJobs.id, id))
		},

		async getJobPortal(id) {
			const rows = await db.select().from(schema.jobPortal).where(eq(schema.jobPortal.id, id)).limit(1)
			if (!rows.length) return null
			return mapJobPortalFromRow(rows[0])
		},

		async getJobPortalByCompany(companyId) {
			const rows = await db
				.select()
				.from(schema.jobPortal)
				.where(eq(schema.jobPortal.company_id, companyId))
				.limit(1)
			if (!rows.length) return null
			return mapJobPortalFromRow(rows[0])
		},

		async createJobPortal(data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.jobPortal, payload)
			await db.insert(schema.jobPortal).values({ id, ...cleaned } as typeof schema.jobPortal.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async updateJobPortal(id, data) {
			const rows = await db.select().from(schema.jobPortal).where(eq(schema.jobPortal.id, id)).limit(1)
			if (!rows.length) return
			const current = mapJobPortalFromRow(rows[0]) as unknown as Record<string, unknown>
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.jobPortal, patched)
			await db.update(schema.jobPortal).set(cleaned as typeof schema.jobPortal.$inferInsert).where(eq(schema.jobPortal.id, id))
		},

		async createInterviewWhatsapp(data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.interviewWhatsapp, payload)
			await db.insert(schema.interviewWhatsapp).values({ id, ...cleaned } as typeof schema.interviewWhatsapp.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},
	}
}
