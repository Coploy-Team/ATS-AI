import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'

import type { CandidateRepository } from '../../../interfaces/repositories'
import type {
	AdminCandidateSummary,
	AdminCandidateSummaryInterview,
	CandidateLike,
	CompanyInterview,
	JobApplied,
	PublicInterview,
} from '@coploy/domain'
import {
	CandidateLikeRepositorySchema,
	CompanyInterviewRepositorySchema,
	JobAppliedRepositorySchema,
	PublicInterviewRepositorySchema,
} from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

function refId(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
		return (value as { id: string }).id ?? null
	}
	return null
}

function isoSafeId(value: string): string {
	return Buffer.from(value).toString('base64url')
}

function candidateSummaryKey(i: CompanyInterview & { id?: string }): string {
	const userId = refId(i.user_ref) ?? i.user_id
	if (userId) return `user:${userId}`
	if (i.email) return `email:${i.email.trim().toLowerCase()}`
	if (i.name) return `name:${i.name.trim().toLowerCase()}`
	return `interview:${i.id ?? ''}`
}

function jobIdOf(i: CompanyInterview): string | null {
	if (i.post_job_id) return i.post_job_id
	if (i.job_ref && typeof i.job_ref === 'object' && 'id' in i.job_ref) {
		return (i.job_ref as { id: string }).id
	}
	return null
}

function toDateOrNull(value: unknown): Date | null {
	if (!value) return null
	const ensureValid = (d: Date): Date | null => {
		if (Number.isNaN(d.getTime())) return null
		const year = d.getUTCFullYear()
		// Firestore aceita Timestamps de 0001-01-01 a 9999-12-31. Datas fora desse
		// range disparam INVALID_ARGUMENT server-side em writes.
		if (year < 1 || year > 9999) return null
		return d
	}
	if (value instanceof Date) return ensureValid(value)
	if (value instanceof Timestamp) return ensureValid(value.toDate())
	if (typeof value === 'string' || typeof value === 'number') {
		return ensureValid(new Date(value))
	}
	if (typeof value === 'object' && 'seconds' in (value as Record<string, unknown>)) {
		const seconds = Number((value as { seconds: unknown }).seconds)
		if (!Number.isFinite(seconds)) return null
		return ensureValid(new Date(seconds * 1000))
	}
	return null
}

function numericScore(score: string | number | null | undefined): number | null {
	if (score === null || score === undefined || score === '') return null
	if (typeof score === 'number') return Number.isFinite(score) ? score : null
	const parsed = Number.parseFloat(score)
	return Number.isFinite(parsed) ? parsed : null
}

function isFinishedInterview(i: CompanyInterview | Partial<CompanyInterview>): boolean {
	return !!((i as { finished?: boolean | null }).finished ?? (i as { finish?: boolean | null }).finish)
}

function isErroredInterview(i: CompanyInterview | AdminCandidateSummaryInterview): boolean {
	const status = (
		'status' in i
			? i.status
			: (i as CompanyInterview).candidateStatus
	) ?? ''
	const statusKey = String(status).toLowerCase()
	return statusKey === 'stuck' || statusKey === 'failed' || statusKey === 'error'
}

function compareSummaryInterviewsDesc(
	a: AdminCandidateSummaryInterview,
	b: AdminCandidateSummaryInterview,
): number {
	if (!a.date && !b.date) return a.id.localeCompare(b.id)
	if (!a.date) return 1
	if (!b.date) return -1
	return b.date.getTime() - a.date.getTime()
}

function mapSummaryInterview(
	interview: CompanyInterview & { id: string },
	companyId: string,
	interviewId: string,
	jobApplied?: JobApplied | null,
	companyName?: string | null,
): AdminCandidateSummaryInterview {
	// Firestore aceita arrays com elementos null (docs legados — InterviewInfoItem[]
	// pode ter null entries quando answers foram deletados). Filtra antes de qualquer
	// acesso a `.finished` pra não quebrar o backfill.
	const info = (jobApplied?.interview?.info ?? []).filter(
		(item): item is NonNullable<typeof item> => item != null,
	)
	const jobAppliedScore =
		(jobApplied?.interview as { score?: string | number | null } | null | undefined)?.score ??
		jobApplied?.score
	const date =
		toDateOrNull(interview.date) ??
		toDateOrNull(interview.dateSelect) ??
		toDateOrNull((interview as { finishedTime?: unknown }).finishedTime) ??
		toDateOrNull(jobApplied?.finishedTime) ??
		toDateOrNull(jobApplied?.dateSelect) ??
		toDateOrNull(jobApplied?.appliedTime) ??
		toDateOrNull(jobApplied?.interview?.dateTime)
	return {
		id: interviewId,
		companyId,
		companyName: companyName ?? null,
		userId: refId(interview.user_ref) ?? interview.user_id ?? refId(jobApplied?.userApplied),
		jobAppliedId: refId(interview.job_applied_ref) ?? interviewId,
		candidateName: interview.name ?? jobApplied?.candidateName ?? null,
		candidateEmail: interview.email ?? null,
		jobName: interview.jobName ?? jobApplied?.jobName ?? null,
		jobId: jobIdOf(interview) ?? refId(jobApplied?.jobApplied),
		score: numericScore(interview.score) ?? numericScore(jobAppliedScore),
		status: interview.candidateStatus ?? jobApplied?.candidateStatus ?? null,
		finished: isFinishedInterview(interview) || !!jobApplied?.finished,
		stopped: !!interview.stopped,
		date,
		typeInterview: interview.typeInterview ?? jobApplied?.typeInterview ?? null,
		interviewMode:
			(interview as { interviewMode?: string | null }).interviewMode ??
			(jobApplied as { interviewMode?: string | null } | null | undefined)?.interviewMode ??
			null,
		questionsAnswered: info.length > 0 ? info.filter((item) => !!item.finished).length : null,
		questionsTotal: info.length > 0 ? info.length : null,
	}
}

/**
 * Gera tokens pra busca textual via Firestore `array-contains`. Cap em ~150
 * tokens por doc pra ficar dentro de uns 2KB (Firestore aguenta 40KB/doc).
 *
 * Tokens incluem:
 *   - exact lowercased: cada campo inteiro
 *   - prefixos 2-20 chars de cada campo
 *   - word splits por espaço, `@` e `.` (cobre nomes compostos e emails)
 *
 * Tudo lowercased + dedup. Search service envia query como `array-contains`
 * de 1 token (geralmente prefixo do que o user digitou).
 */
function buildSummaryKeywords(input: {
	name?: string | null
	email?: string | null
	userId?: string | null
	jobName?: string | null
	companyName?: string | null
	jobId?: string | null
	companyId?: string | null
}): string[] {
	const tokens = new Set<string>()
	const fields = [input.name, input.email, input.userId, input.jobName, input.companyName, input.jobId, input.companyId]
	const MAX_PREFIX = 20
	const MAX_TOKENS = 150
	for (const raw of fields) {
		if (!raw || typeof raw !== 'string') continue
		const lower = raw.toLowerCase().trim()
		if (lower.length < 2) continue
		// exact
		tokens.add(lower)
		// prefixos do campo inteiro
		for (let i = 2; i <= Math.min(lower.length, MAX_PREFIX); i++) {
			tokens.add(lower.substring(0, i))
		}
		// word splits — cobre "João Silva", "user@dominio.com.br", "joao.silva"
		for (const word of lower.split(/[\s@.]+/)) {
			if (word.length < 2) continue
			tokens.add(word)
			for (let i = 2; i <= Math.min(word.length, MAX_PREFIX); i++) {
				tokens.add(word.substring(0, i))
			}
		}
		if (tokens.size >= MAX_TOKENS) break
	}
	return Array.from(tokens).slice(0, MAX_TOKENS)
}

function mapSummaryDoc(raw: Record<string, unknown>, interviews: AdminCandidateSummaryInterview[]): AdminCandidateSummary {
	const normalized = normalizeDoc(raw)
	return {
		id: String(normalized.id ?? ''),
		candidateKey: String(normalized.candidateKey ?? normalized.id ?? ''),
		name: typeof normalized.name === 'string' ? normalized.name : '-',
		email: typeof normalized.email === 'string' ? normalized.email : null,
		userId: typeof normalized.userId === 'string' ? normalized.userId : null,
		companyId: typeof normalized.companyId === 'string' ? normalized.companyId : '',
		companyName: typeof normalized.companyName === 'string' ? normalized.companyName : null,
		jobName: typeof normalized.jobName === 'string' ? normalized.jobName : null,
		jobId: typeof normalized.jobId === 'string' ? normalized.jobId : null,
		totalInterviews: Number(normalized.totalInterviews ?? 0),
		finishedInterviews: Number(normalized.finishedInterviews ?? 0),
		pendingInterviews: Number(normalized.pendingInterviews ?? 0),
		erroredInterviews: Number(normalized.erroredInterviews ?? 0),
		bestScore: numericScore(normalized.bestScore as string | number | null | undefined),
		lastStatus: typeof normalized.lastStatus === 'string' ? normalized.lastStatus : null,
		lastFinished: Boolean(normalized.lastFinished),
		lastDate: toDateOrNull(normalized.lastDate),
		lastInterviewId: typeof normalized.lastInterviewId === 'string' ? normalized.lastInterviewId : '',
		updatedAt: toDateOrNull(normalized.updatedAt),
		interviews,
		keywords: Array.isArray(normalized.keywords)
			? (normalized.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
			: [],
	}
}

function mapSummaryInterviewDoc(raw: Record<string, unknown>): AdminCandidateSummaryInterview {
	const normalized = normalizeDoc(raw)
	return {
		id: String(normalized.id ?? ''),
		companyId: typeof normalized.companyId === 'string' ? normalized.companyId : '',
		companyName: typeof normalized.companyName === 'string' ? normalized.companyName : null,
		userId: typeof normalized.userId === 'string' ? normalized.userId : null,
		jobAppliedId: typeof normalized.jobAppliedId === 'string' ? normalized.jobAppliedId : null,
		candidateName: typeof normalized.candidateName === 'string' ? normalized.candidateName : null,
		candidateEmail: typeof normalized.candidateEmail === 'string' ? normalized.candidateEmail : null,
		jobName: typeof normalized.jobName === 'string' ? normalized.jobName : null,
		jobId: typeof normalized.jobId === 'string' ? normalized.jobId : null,
		score: numericScore(normalized.score as string | number | null | undefined),
		status: typeof normalized.status === 'string' ? normalized.status : null,
		finished: Boolean(normalized.finished),
		stopped: Boolean(normalized.stopped),
		date: toDateOrNull(normalized.date),
		typeInterview: typeof normalized.typeInterview === 'string' ? normalized.typeInterview : null,
		interviewMode: typeof normalized.interviewMode === 'string' ? normalized.interviewMode : null,
		questionsAnswered: typeof normalized.questionsAnswered === 'number' ? normalized.questionsAnswered : null,
		questionsTotal: typeof normalized.questionsTotal === 'number' ? normalized.questionsTotal : null,
	}
}

export function createFirestoreCandidateRepository(db: Firestore): CandidateRepository {
	return {
		async getJobApplied(userId, jobAppliedId) {
			const doc = await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(jobAppliedId)
				.get()
			return mapDoc<JobApplied>(doc, JobAppliedRepositorySchema)
		},
		async listJobsApplied(userId, options) {
			const col = db.collection('users').doc(userId).collection('jobsApplied')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<JobApplied>(snapshot, JobAppliedRepositorySchema)
		},
		async createJobApplied(userId, data, customId) {
			const col = db.collection('users').doc(userId).collection('jobsApplied')
			if (customId) {
				await col.doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as JobApplied & { id: string }
			}
			const ref = await col.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as JobApplied & { id: string }
		},
		async updateJobApplied(userId, id, data) {
			await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(id)
				.update(data)
		},
		async updateJobAppliedInTransaction(userId, id, updateFn) {
			const docRef = db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(id)

			await db.runTransaction(async (transaction) => {
				const snapshot = await transaction.get(docRef)
				if (!snapshot.exists) {
					throw new Error(`JobApplied ${id} not found for user ${userId}`)
				}

				const current = normalizeDoc({ ...snapshot.data(), id: snapshot.id })
				const updates = updateFn(current as any)
				// Skip se a updateFn não tem nada pra atualizar (ex: callers
				// que retornam `{}` quando a entidade interna não foi encontrada).
				// Sem isso, transaction.update(docRef, {}) lança
				// "Update() requires ... At least one field must be updated".
				if (!updates || Object.keys(updates as Record<string, unknown>).length === 0) {
					return
				}
				transaction.update(docRef, updates as any)
			})
		},
		async setJobApplied(userId, id, data) {
			await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(id)
				.set(data, { merge: true })
		},
		async listCompanyInterviews(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('companyInterviews')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<CompanyInterview>(snapshot, CompanyInterviewRepositorySchema)
		},
		async countCompanyInterviews(companyId, filters) {
			let q: FirebaseFirestore.Query = db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
			if (filters?.finished === true) q = q.where('finished', '==', true)
			if (filters?.dateGte) q = q.where('date', '>=', filters.dateGte)
			try {
				const snap = await q.count().get()
				return snap.data().count
			} catch (err: unknown) {
				// FAILED_PRECONDITION (9) = índice composto não existe ainda.
				// Retornamos null pra caller decidir fallback (em vez de propagar erro).
				if ((err as { code?: number })?.code === 9) {
					console.warn(
						'[countCompanyInterviews] missing composite index. Click the link in the next line to create:\n' +
							((err as { message?: string })?.message ?? ''),
					)
					return null
				}
				throw err
			}
		},
		async listAdminCandidateSummaries(options) {
			const limit = options?.limit ?? 50
			const offset = options?.offset ?? 0
			const search = options?.search?.trim().toLowerCase()
			const includeInterviews = options?.includeInterviews ?? false
			let q: FirebaseFirestore.Query = db
				.collection('adminCandidateSummaries')
				.orderBy('lastDate', 'desc')
			if (search) {
				// Firestore não tem busca textual nativa. Para busca admin, lemos uma
				// janela maior e filtramos em memória sem tocar em companyInterviews.
				q = q.limit(Math.max(limit + offset, 500))
			} else {
				if (offset > 0) q = q.offset(offset)
				q = q.limit(limit)
			}
			const snap = await q.get()
			const docs = search
				? snap.docs
					.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
					.filter((raw) => {
						const rawData = raw as Record<string, unknown>
						const values = [
							rawData.name,
							rawData.email,
							rawData.userId,
							rawData.companyId,
							rawData.companyName,
							rawData.jobName,
							rawData.jobId,
						]
						return values
							.filter((value): value is string => typeof value === 'string')
							.some((value) => value.toLowerCase().includes(search))
					})
					.slice(offset, offset + limit)
				: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))

			if (!includeInterviews) {
				return docs.map((raw) => mapSummaryDoc(raw, []))
			}

			const summaries = await Promise.all(
				docs.map(async (raw) => {
					const interviewsSnap = await db
						.collection('adminCandidateSummaries')
						.doc(String(raw.id))
						.collection('interviews')
						.orderBy('date', 'desc')
						.limit(100)
						.get()
					const interviews = interviewsSnap.docs.map((doc) =>
						mapSummaryInterviewDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }),
					)
					return mapSummaryDoc(raw, interviews)
				}),
			)
			return summaries
		},
		async getAdminCandidateSummary(id) {
			const doc = await db.collection('adminCandidateSummaries').doc(id).get()
			if (!doc.exists) return null
			const interviewsSnap = await db
				.collection('adminCandidateSummaries')
				.doc(id)
				.collection('interviews')
				.orderBy('date', 'desc')
				.limit(100)
				.get()
			const interviews = interviewsSnap.docs.map((interviewDoc) =>
				mapSummaryInterviewDoc({ id: interviewDoc.id, ...(interviewDoc.data() as Record<string, unknown>) }),
			)
			return mapSummaryDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }, interviews)
		},
		async findAdminCandidateSummariesByExact(field, value) {
			const snap = await db
				.collection('adminCandidateSummaries')
				.where(field, '==', value)
				.limit(20)
				.get()
			return snap.docs.map((doc) =>
				mapSummaryDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }, []),
			)
		},
		async searchAdminCandidateSummariesByKeyword(token, options) {
			const limit = options?.limit ?? 200
			const normalized = token.trim().toLowerCase()
			if (normalized.length < 2) return []
			try {
				const snap = await db
					.collection('adminCandidateSummaries')
					.where('keywords', 'array-contains', normalized)
					.limit(limit)
					.get()
				return snap.docs.map((doc) =>
					mapSummaryDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }, []),
				)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					// FAILED_PRECONDITION: keywords[] ainda sem índice no env atual.
					// Search service tem fallback in-memory; retorna [] aqui pra ele
					// cair pro outro caminho sem quebrar a query.
					console.warn('[adminCandidateSummaries] keywords array-contains index not ready')
					return []
				}
				throw err
			}
		},
		async countAdminCandidateSummaries(options) {
			const search = options?.search?.trim().toLowerCase()
			if (search) {
				// Search bounded path: tenta keywords[] indexado primeiro. Se cair
				// fora do índice (legacy docs sem keywords), conta uma janela cap
				// de 1500 — NUNCA full collection scan (causou 503 em prod quando
				// /admin/candidates passava search direto pra count).
				try {
					const indexedSnap = await db
						.collection('adminCandidateSummaries')
						.where('keywords', 'array-contains', search)
						.limit(1500)
						.count()
						.get()
					return indexedSnap.data().count
				} catch (err: unknown) {
					if ((err as { code?: number })?.code !== 9) throw err
				}
				const snap = await db
					.collection('adminCandidateSummaries')
					.orderBy('lastDate', 'desc')
					.limit(1500)
					.get()
				return snap.docs.filter((doc) => {
					const raw = doc.data()
					const values = [
						raw.name,
						raw.email,
						raw.userId,
						raw.companyId,
						raw.companyName,
						raw.jobName,
						raw.jobId,
					]
					return values
						.filter((value): value is string => typeof value === 'string')
						.some((value) => value.toLowerCase().includes(search))
				}).length
			}
			const snap = await db.collection('adminCandidateSummaries').count().get()
			return snap.data().count
		},
		async syncAdminCandidateSummaryInterview(companyId, interviewId, data) {
			const interview = normalizeDoc({
				id: interviewId,
				company_id: companyId,
				...(data as Record<string, unknown>),
			}) as unknown as CompanyInterview & { id: string }
			const candidateKey = candidateSummaryKey(interview)
			if (!candidateKey || candidateKey === 'interview:') return
			const summaryId = isoSafeId(candidateKey)
			const summaryRef = db.collection('adminCandidateSummaries').doc(summaryId)
			const interviewRef = summaryRef.collection('interviews').doc(isoSafeId(`${companyId}:${interviewId}`))
			const userId = refId(interview.user_ref) ?? interview.user_id ?? null
			const jobAppliedId = refId(interview.job_applied_ref) ?? interviewId
			const [jobAppliedDoc, companyDoc] = await Promise.all([
				userId && jobAppliedId
					? db
						.collection('users')
						.doc(userId)
						.collection('jobsApplied')
						.doc(jobAppliedId)
						.get()
					: Promise.resolve(null),
				db.collection('companies').doc(companyId).get(),
			])
			const jobApplied = jobAppliedDoc?.exists
				? mapDoc<JobApplied>(jobAppliedDoc, JobAppliedRepositorySchema)
				: null
			const companyName =
				companyDoc?.exists
					? ((companyDoc.data() as { companyName?: string | null } | undefined)?.companyName ?? null)
					: null

			await interviewRef.set(
				{
					...mapSummaryInterview(interview, companyId, interviewId, jobApplied, companyName),
					updatedAt: FieldValue.serverTimestamp(),
				},
				{ merge: true },
			)

			const interviewsSnap = await summaryRef.collection('interviews').get()
			const interviews = interviewsSnap.docs
				.map((doc) => mapSummaryInterviewDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
				.sort(compareSummaryInterviewsDesc)

			if (interviews.length === 0) {
				await summaryRef.delete()
				return
			}

			const latest = interviews[0]
			const scores = interviews
				.map((item) => item.score)
				.filter((score): score is number => typeof score === 'number')
			const bestScore = scores.length > 0 ? Math.max(...scores) : null
			const finishedInterviews = interviews.filter((item) => item.finished && !item.stopped).length
			const erroredInterviews = interviews.filter(isErroredInterview).length
			const keywords = buildSummaryKeywords({
				name: latest.candidateName,
				email: latest.candidateEmail,
				userId: latest.userId,
				jobName: latest.jobName,
				companyName: latest.companyName,
				jobId: latest.jobId,
				companyId: latest.companyId,
			})
			await summaryRef.set(
				{
					candidateKey,
					name: latest.candidateName ?? '-',
					email: latest.candidateEmail ?? null,
					userId: latest.userId ?? null,
					companyId: latest.companyId,
					companyName: latest.companyName,
					jobName: latest.jobName,
					jobId: latest.jobId,
					totalInterviews: interviews.length,
					finishedInterviews,
					pendingInterviews: interviews.length - finishedInterviews - erroredInterviews,
					erroredInterviews,
					bestScore,
					lastStatus: latest.status,
					lastFinished: latest.finished,
					lastDate: latest.date,
					lastInterviewId: latest.id,
					keywords,
					updatedAt: FieldValue.serverTimestamp(),
				},
				{ merge: true },
			)
		},
		async getCompanyInterview(companyId, interviewId) {
			const col = db.collection('companies').doc(companyId).collection('companyInterviews')
			// Caminho rápido: o docId do mirror é tipicamente o `jobAppliedId`.
			const doc = await col.doc(interviewId).get()
			if (doc.exists) {
				const parsed = mapDoc<CompanyInterview>(doc, CompanyInterviewRepositorySchema)
				return parsed ? ({ ...parsed, id: doc.id } as CompanyInterview & { id: string }) : null
			}
			// Fallback legado: alguns docs antigos têm autoId e referenciam o
			// jobApplied via `job_applied_ref.id`.
			const snap = await col.where('job_applied_ref.id', '==', interviewId).limit(1).get()
			if (snap.empty) return null
			const first = snap.docs[0]
			const parsed = mapDoc<CompanyInterview>(first, CompanyInterviewRepositorySchema)
			return parsed ? ({ ...parsed, id: first.id } as CompanyInterview & { id: string }) : null
		},
		async listJobInterviews(companyId, jobId, options) {
			const col = db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.collection('interviews')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<CompanyInterview>(snapshot, CompanyInterviewRepositorySchema)
		},
		async listAllCompanyInterviews(opts) {
			const limit = opts?.limit ?? 200
			// Hydrate company_id from the parent doc path. Many legacy docs don't have
			// the field set, but the path is `companies/{companyId}/companyInterviews/{id}`.
			// normalizeDoc converts Firestore Timestamp/DocumentReference → Date/EntityRef
			// before the Zod schema parses it.
			const enrich = (
				docs: FirebaseFirestore.QuerySnapshot,
			): CompanyInterview[] => {
				const list: CompanyInterview[] = []
				for (const doc of docs.docs) {
					const raw: Record<string, unknown> = { id: doc.id, ...(doc.data() as Record<string, unknown>) }
					if (!raw.company_id) {
						const parent = doc.ref.parent.parent
						if (parent) raw.company_id = parent.id
					}
					const normalized = normalizeDoc(raw)
					list.push(
						(CompanyInterviewRepositorySchema.parse(normalized) as unknown) as CompanyInterview,
					)
				}
				return list
			}

			try {
				const cursorDate =
					opts?.startAfterDate instanceof Date
						? opts.startAfterDate
						: opts?.startAfterDate
							? new Date(opts.startAfterDate)
							: null
				if (opts?.companyId) {
					let q: FirebaseFirestore.Query = db
						.collection('companies')
						.doc(opts.companyId)
						.collection('companyInterviews')
						.orderBy('date', 'desc')
					if (opts?.dateGte) q = q.where('date', '>=', opts.dateGte)
					if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
						q = q.startAfter(Timestamp.fromDate(cursorDate))
					}
					const snap = await q.limit(limit).get()
					return enrich(snap)
				}
				let q: FirebaseFirestore.Query = db.collectionGroup('companyInterviews').orderBy('date', 'desc')
				// Only `candidateStatus` has a composite index. `finished`/`stopped`/`pending`
				// filters are applied client-side in the service layer to avoid extra indexes.
				if (
					opts?.status &&
					opts.status !== 'finished' &&
					opts.status !== 'stopped' &&
					opts.status !== 'pending'
				) {
					q = q.where('candidateStatus', '==', opts.status)
				}
				if (opts?.dateGte) q = q.where('date', '>=', opts.dateGte)
				if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
					q = q.startAfter(Timestamp.fromDate(cursorDate))
				}
				const snap = await q.limit(limit).get()
				return enrich(snap)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					const message = (err as { message?: string })?.message ?? ''
					console.warn(
						'[CompanyInterview] listAll index not ready. Click the link in the next line to auto-create:\n' + message,
					)
					return []
				}
				throw err
			}
		},
		async listCompanyInterviewsForBackfill(opts) {
			// Backfill exhaustivo: orderBy('__name__') visita TODOS os docs,
			// incluindo legados sem campo `date`. listAllCompanyInterviews usa
			// orderBy('date', 'desc') que filtra implicitamente docs sem o campo.
			//
			// Em collectionGroup, `__name__` é o full path
			// (ex: `companies/abc/companyInterviews/xyz`), não só o docId. Cursor
			// também é o full path — server resolve o snapshot via `db.doc(path)`
			// pra usar `startAfter(snapshot)`.
			const limit = opts?.limit ?? 800
			let q: FirebaseFirestore.Query = db
				.collectionGroup('companyInterviews')
				.orderBy('__name__')
			if (opts?.cursorDocId) {
				const snap = await db.doc(opts.cursorDocId).get()
				if (snap.exists) q = q.startAfter(snap)
			}
			const snap = await q.limit(limit).get()
			const list: (CompanyInterview & { id: string })[] = []
			for (const doc of snap.docs) {
				const raw: Record<string, unknown> = { id: doc.id, ...(doc.data() as Record<string, unknown>) }
				if (!raw.company_id) {
					const parent = doc.ref.parent.parent
					if (parent) raw.company_id = parent.id
				}
				const normalized = normalizeDoc(raw)
				const parsed = CompanyInterviewRepositorySchema.parse(normalized) as unknown as CompanyInterview & { id: string }
				// Anexa o full path do doc como propriedade não-schema — o backfill
				// service usa pra montar o próximo cursor.
				;(parsed as { _path?: string })._path = doc.ref.path
				list.push(parsed)
			}
			return list
		},
		async listPublicInterviews(options) {
			// Cursor por docId + startAfter(snapshot) — necessário pra lidar com
			// empates de `score_value` (especialmente vários docs com score=0):
			// `where('score_value', '<', cursor)` exclui TODOS os docs no boundary,
			// fazendo paginação pular candidatos. `startAfter(snap)` usa o docId
			// como tiebreaker implícito (Firestore default), garantindo continuidade.
			const cursor = options?.startAfterCursor
			const optionsWithoutCursor = options ? { ...options, startAfterCursor: undefined } : options
			let queryRef = applyFilters(db.collection('public_interviews'), optionsWithoutCursor)

			if (cursor !== undefined && cursor !== null && cursor !== '') {
				const cursorDocId = String(cursor)
				const cursorDoc = await db.collection('public_interviews').doc(cursorDocId).get()
				if (cursorDoc.exists) {
					queryRef = queryRef.startAfter(cursorDoc)
				}
				// Doc inexistente: ignora cursor (volta pro começo). Acontece quando
				// o cliente envia cursor stale (entrevista deletada, env diferente).
			}

			const snapshot = await queryRef.get()
			return mapDocsWithSchema<PublicInterview>(snapshot, PublicInterviewRepositorySchema)
		},
		async listPublicInterviewsByUsers(userIds) {
			const unicos = [...new Set(userIds.filter(Boolean))]
			if (unicos.length === 0) return []

			/*
			 * `in` do Firestore aceita no máximo 30 valores por consulta, e
			 * `user_ref` é DocumentReference — comparar com string não casa nada
			 * (voltaria vazio em silêncio, que é o pior modo de falhar aqui).
			 */
			const LOTE = 30
			const lotes: string[][] = []
			for (let i = 0; i < unicos.length; i += LOTE) {
				lotes.push(unicos.slice(i, i + LOTE))
			}

			const resultados = await Promise.all(
				lotes.map(async (lote) => {
					const snapshot = await db
						.collection('public_interviews')
						.where(
							'user_ref',
							'in',
							lote.map((uid) => db.collection('users').doc(uid)),
						)
						.get()
					return mapDocsWithSchema<PublicInterview>(snapshot, PublicInterviewRepositorySchema)
				}),
			)

			return resultados.flat()
		},
		async getPublicInterview(id) {
			const doc = await db.collection('public_interviews').doc(id).get()
			return mapDoc<PublicInterview>(doc, PublicInterviewRepositorySchema)
		},
		async updatePublicInterview(id, data) {
			await db.collection('public_interviews').doc(id).update(data)
		},
		async upsertPublicInterview(jobAppliedId, data) {
			// Dedup por `job_applied_ref.id` pra ficar compatível com docs do legado
			// (auto-IDs gerados pelo C# `FastInterviewRepository.SavePublicInterviews`).
			// Sem isso, finalizar a mesma entrevista duas vezes criaria duplicatas.
			const col = db.collection('public_interviews')
			const snap = await col.where('job_applied_ref.id', '==', jobAppliedId).limit(1).get()
			if (!snap.empty) {
				await snap.docs[0].ref.set(data, { merge: true })
				return
			}
			await col.add(data)
		},
		async listCandidateLikes(userId, jobAppliedId) {
			const snapshot = await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(jobAppliedId)
				.collection('candidate_likes')
				.get()
			return mapDocsWithSchema<CandidateLike>(snapshot, CandidateLikeRepositorySchema)
		},
		async createCandidateLike(userId, jobAppliedId, data) {
			const ref = await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(jobAppliedId)
				.collection('candidate_likes')
				.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as CandidateLike & { id: string }
		},
		async deleteCandidateLike(userId, jobAppliedId, likeId) {
			await db
				.collection('users')
				.doc(userId)
				.collection('jobsApplied')
				.doc(jobAppliedId)
				.collection('candidate_likes')
				.doc(likeId)
				.delete()
		},
		async getJobInterview(companyId, jobId, interviewId) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.collection('interviews')
				.doc(interviewId)
				.get()
			return mapDoc<JobApplied>(doc, JobAppliedRepositorySchema)
		},
		async setJobInterview(companyId, jobId, interviewId, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.collection('interviews')
				.doc(interviewId)
				.set(data, { merge: true })
		},
		async updateJobInterview(companyId, jobId, interviewId, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.collection('interviews')
				.doc(interviewId)
				.update(data)
		},
		async setCompanyInterview(companyId, interviewId, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.set(data, { merge: true })
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.get()
			if (doc.exists) {
				await this.syncAdminCandidateSummaryInterview(
					companyId,
					interviewId,
					normalizeDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as never,
				)
			}
		},
		async updateCompanyInterview(companyId, interviewId, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.update(data)
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.get()
			if (doc.exists) {
				await this.syncAdminCandidateSummaryInterview(
					companyId,
					interviewId,
					normalizeDoc({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as never,
				)
			}
		},
		async deleteJobApplied(userId, id) {
			// Apaga o doc principal + subcollection candidate_likes
			const docRef = db.collection('users').doc(userId).collection('jobsApplied').doc(id)
			const likesSnap = await docRef.collection('candidate_likes').get()
			const batch = db.batch()
			likesSnap.docs.forEach((doc) => batch.delete(doc.ref))
			batch.delete(docRef)
			await batch.commit()
		},
		async deleteJobInterview(companyId, jobId, interviewId) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.collection('interviews')
				.doc(interviewId)
				.delete()
		},
		async deleteCompanyInterview(companyId, interviewId) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.get()
			if (doc.exists) {
				const interview = normalizeDoc({
					id: doc.id,
					...(doc.data() as Record<string, unknown>),
				}) as unknown as CompanyInterview & { id: string }
				const candidateKey = candidateSummaryKey(interview)
				if (candidateKey && candidateKey !== 'interview:') {
					const summaryRef = db.collection('adminCandidateSummaries').doc(isoSafeId(candidateKey))
					await summaryRef
						.collection('interviews')
						.doc(isoSafeId(`${companyId}:${interviewId}`))
						.delete()
					const interviewsSnap = await summaryRef.collection('interviews').get()
					if (interviewsSnap.empty) {
						await summaryRef.delete()
					} else {
						const interviews = interviewsSnap.docs
							.map((item) => mapSummaryInterviewDoc({
								id: item.id,
								...(item.data() as Record<string, unknown>),
							}))
							.sort(compareSummaryInterviewsDesc)
						const latest = interviews[0]
						const scores = interviews
							.map((item) => item.score)
							.filter((score): score is number => typeof score === 'number')
						const bestScore = scores.length > 0 ? Math.max(...scores) : null
						const finishedInterviews = interviews.filter((item) => item.finished && !item.stopped).length
						const erroredInterviews = interviews.filter(isErroredInterview).length
						await summaryRef.set(
							{
								candidateKey,
								name: latest.candidateName ?? '-',
								email: latest.candidateEmail ?? null,
								userId: latest.userId ?? null,
								companyId: latest.companyId,
								companyName: latest.companyName,
								jobName: latest.jobName,
								jobId: latest.jobId,
								totalInterviews: interviews.length,
								finishedInterviews,
								pendingInterviews: interviews.length - finishedInterviews - erroredInterviews,
								erroredInterviews,
								bestScore,
								lastStatus: latest.status,
								lastFinished: latest.finished,
								lastDate: latest.date,
								lastInterviewId: latest.id,
								updatedAt: FieldValue.serverTimestamp(),
							},
							{ merge: true },
						)
					}
				}
			}
			await db
				.collection('companies')
				.doc(companyId)
				.collection('companyInterviews')
				.doc(interviewId)
				.delete()
		},
	}
}
