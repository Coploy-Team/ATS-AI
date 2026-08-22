import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'
import type { CompanyInterview, PostJob, UsersCompany } from '@coploy/domain'

type Severity = 'high' | 'medium' | 'low'
type InboxType =
	// Mantido pra retrocompat — não deve mais ser emitido (substituído
	// pelos 3 buckets de aging abaixo).
	| 'pending_feedback'
	| 'pending_feedback_recent' // 5-30d (medium)
	| 'pending_feedback_stale' // 30-90d (high)
	| 'pending_feedback_old' // >90d — dívida histórica (low)
	| 'high_score_no_decision'
	| 'job_no_candidates'
	| 'stale_open_job'

interface InboxItem {
	type: InboxType
	severity: Severity
	title: string
	description: string
	count: number
	ageDays?: number | null
	href?: string
}

// Cache em memória por companyId. O inbox agrega listagens grandes
// (todas as entrevistas finalizadas + todas as vagas abertas) — em
// empresas com volume alto isso vira ~5s por request. TTL de 5 min é
// agressivo o suficiente pra absorver navegação e suave o bastante
// pra não esconder ações do recrutador por muito tempo.
type InboxCacheEntry = {
	data: { items: InboxItem[]; avgFeedbackTimeDays: number | null }
	expiresAt: number
}
const inboxCache = new Map<string, InboxCacheEntry>()
const INBOX_CACHE_TTL = 5 * 60 * 1000

const PENDING_FEEDBACK_AGE_DAYS = 5
const HIGH_SCORE_THRESHOLD = 8
const STALE_JOB_AGE_DAYS = 30
const NO_CANDIDATES_WINDOW_DAYS = 7
// Vagas criadas há mais que isso são tratadas como "data debt" e
// excluídas do inbox — mesmo com stopped=false/archived=false, vagas
// muito antigas não foram fechadas explicitamente mas não estão
// sendo trabalhadas. Não serve sinalizar pro recrutador.
const RECENT_JOB_WINDOW_DAYS = 180

function daysSince(date: Date | null | undefined, now: Date): number | null {
	if (!date) return null
	const ms = now.getTime() - new Date(date).getTime()
	if (!Number.isFinite(ms) || ms < 0) return null
	return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function parseScore(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw
	if (typeof raw === 'string') {
		const n = Number.parseFloat(raw)
		return Number.isFinite(n) ? n : null
	}
	return null
}

export function getInbox(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/inbox',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Caixa de atenção do recrutador',
					description:
						'Retorna lista priorizada de pendências e oportunidades acionáveis: candidatos esperando feedback, scores altos sem decisão, vagas sem candidatos, vagas paradas há muito tempo.',
					body: z.object({
						uidCompany: z.string().optional(),
						noCache: z.boolean().optional(),
					}),
					response: {
						200: z.object({
							items: z.array(
								z.object({
									type: z.enum([
										'pending_feedback',
										'pending_feedback_recent',
										'pending_feedback_stale',
										'pending_feedback_old',
										'high_score_no_decision',
										'job_no_candidates',
										'stale_open_job',
									]),
									severity: z.enum(['high', 'medium', 'low']),
									title: z.string(),
									description: z.string(),
									count: z.number(),
									ageDays: z.number().nullable().optional(),
									href: z.string().optional(),
								}),
							),
							// Tempo médio entre data da entrevista e da
							// decisão (Approved/Selected/Rejected) — usado
							// como contexto no header da inbox. null
							// quando não há decisões com `dateSelect`
							// preenchido.
							avgFeedbackTimeDays: z.number().nullable(),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const user = (await dashboardService.getUsersCompany(userId)) as UsersCompany | null
				if (!user?.company?.id) {
					throw new BadRequestError('User or company not found')
				}

				const { uidCompany, noCache } = request.body as {
					uidCompany?: string
					noCache?: boolean
				}
				const companyId = uidCompany || user.company.id
				const now = new Date()

				// Server-side cache: aproveita entre instâncias e cobre o caso
				// do usuário acessar o dashboard em vários browsers/abas sem
				// que cada um pague o custo do agregador.
				const cached = inboxCache.get(companyId)
				if (!noCache && cached && cached.expiresAt > now.getTime()) {
					return cached.data
				}

				const [allFinished, allOpenJobs] = await Promise.all([
					dashboardService.listCompanyInterviews(companyId, {
						filters: [{ field: 'finished', operator: '==', value: true }],
						orderByField: 'date',
						orderDirection: 'desc',
					}) as Promise<CompanyInterview[]>,
					// Mesmo filtro que /companies/jobs?status=active usa: stopped==false
					// E archived==false. Usar !j.stopped (permissivo) inclui vagas
					// legadas sem flag e infla os contadores ridiculamente.
					dashboardService.listJobs(companyId, {
						filters: [
							{ field: 'stopped', operator: '==', value: false },
							{ field: 'archived', operator: '==', value: false },
						],
					}) as Promise<PostJob[]>,
				])

				// Recorte adicional: ignora vagas legadas (criadas há +180 dias)
				// — sinalizá-las só polui o inbox; recrutador não vai mexer
				// nelas a partir de uma notificação no dashboard.
				const openJobs = allOpenJobs.filter((j) => {
					const days = daysSince(j.timeCreated, now)
					return days === null || days <= RECENT_JOB_WINDOW_DAYS
				})

				// 1. Pendentes de decisão: finalizadas há > 5 dias com candidateStatus=Pending.
				const pendingFeedback = allFinished.filter((i) => {
					if (i.candidateStatus !== 'Pending') return false
					const days = daysSince(i.date as unknown as Date, now)
					return days !== null && days >= PENDING_FEEDBACK_AGE_DAYS
				})

				// 2. Score alto e ainda sem decisão tomada (Pending).
				const highScoreNoDecision = allFinished.filter((i) => {
					if (i.candidateStatus !== 'Pending') return false
					const score = parseScore(i.score)
					return score !== null && score >= HIGH_SCORE_THRESHOLD
				})

				// 3. Vagas abertas sem candidatos na janela recente.
				const recentInterviewsByJobName = new Set<string>()
				for (const i of allFinished) {
					const days = daysSince(i.date as unknown as Date, now)
					if (days !== null && days <= NO_CANDIDATES_WINDOW_DAYS && i.jobName) {
						recentInterviewsByJobName.add(i.jobName)
					}
				}
				const jobsNoCandidates = openJobs.filter(
					(j) => j.jobName && !recentInterviewsByJobName.has(j.jobName),
				)

				// 4. Vagas abertas há mais de N dias.
				const staleJobs = openJobs.filter((j) => {
					const days = daysSince(j.timeCreated, now)
					return days !== null && days >= STALE_JOB_AGE_DAYS
				})

				const items: InboxItem[] = []

				if (highScoreNoDecision.length > 0) {
					items.push({
						type: 'high_score_no_decision',
						severity: 'high',
						title: `${highScoreNoDecision.length} ${highScoreNoDecision.length === 1 ? 'candidato com nota alta aguardando decisão' : 'candidatos com nota alta aguardando decisão'}`,
						description: `Entrevistas com score ≥ ${HIGH_SCORE_THRESHOLD} ainda marcadas como pendentes — top do mês esperando feedback.`,
						count: highScoreNoDecision.length,
						href: '/candidates?preset=high-score-pending',
					})
				}

				// Aging breakdown — separa "esperando feedback" em 3 janelas
				// pra evitar que dívida histórica (entrevistas de meses/anos
				// atrás) afogue as pendências reais do mês. Cada bucket vira
				// um item da inbox separado.
				if (pendingFeedback.length > 0) {
					const recent = pendingFeedback.filter((i) => {
						const d = daysSince(i.date as unknown as Date, now) ?? 0
						return d < 30
					})
					const stale = pendingFeedback.filter((i) => {
						const d = daysSince(i.date as unknown as Date, now) ?? 0
						return d >= 30 && d < 90
					})
					const old = pendingFeedback.filter((i) => {
						const d = daysSince(i.date as unknown as Date, now) ?? 0
						return d >= 90
					})

					const computeOldest = (arr: CompanyInterview[]) =>
						arr.reduce((max, i) => {
							const d = daysSince(i.date as unknown as Date, now) ?? 0
							return Math.max(max, d)
						}, 0)

					const buildOldestExample = (arr: CompanyInterview[]) => {
						if (arr.length === 0) return null
						const sorted = [...arr].sort((a, b) => {
							const aDays = daysSince(a.date as unknown as Date, now) ?? 0
							const bDays = daysSince(b.date as unknown as Date, now) ?? 0
							return bDays - aDays
						})
						const oldest = sorted[0] as unknown as Record<string, unknown>
						const candidateName =
							typeof oldest.name === 'string' ? oldest.name : null
						const jobName =
							typeof oldest.jobName === 'string' ? oldest.jobName : null
						if (!candidateName && !jobName) return null
						if (candidateName && jobName) return `${candidateName} - ${jobName}`
						return candidateName || jobName
					}

					if (recent.length > 0) {
						items.push({
							type: 'pending_feedback_recent',
							severity: 'medium',
							title: `${recent.length} ${recent.length === 1 ? 'candidato esperando feedback' : 'candidatos esperando feedback'}`,
							description: `Entrevistas finalizadas há ${PENDING_FEEDBACK_AGE_DAYS}-30 dias — janela em que o feedback ainda é fresco.`,
							count: recent.length,
							ageDays: computeOldest(recent),
							href: '/candidates?preset=pending-feedback&age=recent',
						})
					}
					if (stale.length > 0) {
						items.push({
							type: 'pending_feedback_stale',
							severity: 'high',
							title: `${stale.length} ${stale.length === 1 ? 'feedback atrasado há mais de 30 dias' : 'feedbacks atrasados há mais de 30 dias'}`,
							description: `Entrevistas finalizadas entre 30 e 90 dias atrás — risco de perder o candidato pro mercado.`,
							count: stale.length,
							ageDays: computeOldest(stale),
							href: '/candidates?preset=pending-feedback&age=stale',
						})
					}
					if (old.length > 0) {
						const oldestExample = buildOldestExample(old)
						items.push({
							type: 'pending_feedback_old',
							severity: 'low',
							title: `${old.length} ${old.length === 1 ? 'entrevista antiga sem decisão' : 'entrevistas antigas sem decisão'}`,
							description: `Dívida histórica — entrevistas de mais de 90 dias atrás. Considere arquivar em massa ou rejeitar pra limpar o pipeline.${oldestExample ? ` Exemplo: ${oldestExample}.` : ''}`,
							count: old.length,
							ageDays: computeOldest(old),
							href: '/candidates?preset=pending-feedback&age=old',
						})
					}
				}

				if (jobsNoCandidates.length > 0) {
					items.push({
						type: 'job_no_candidates',
						severity: 'medium',
						title: `${jobsNoCandidates.length} ${jobsNoCandidates.length === 1 ? 'vaga sem candidatos esta semana' : 'vagas sem candidatos esta semana'}`,
						description: `Vagas abertas que não receberam entrevistas nos últimos ${NO_CANDIDATES_WINDOW_DAYS} dias — anúncio pode estar fraco.`,
						count: jobsNoCandidates.length,
						href: '/all-jobs',
					})
				}

				if (staleJobs.length > 0) {
					items.push({
						type: 'stale_open_job',
						severity: 'low',
						title: `${staleJobs.length} ${staleJobs.length === 1 ? 'vaga aberta há mais de' : 'vagas abertas há mais de'} ${STALE_JOB_AGE_DAYS} dias`,
						description: 'Vagas que estão rodando há tempo — vale revisar se ainda fazem sentido ou ajustar critérios.',
						count: staleJobs.length,
						href: '/all-jobs',
					})
				}

				// Ordena por severidade (high → medium → low) preservando ordem dentro
				// de cada nível.
				const severityWeight: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
				items.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity])

				// Tempo médio de feedback — entre data da entrevista e
				// data da decisão pra entrevistas decididas (não-Pending)
				// que já têm `dateSelect` setado. Header da inbox usa
				// pra contextualizar "29 atrasados há +30d" — a média
				// típica vs os outliers.
				const decided = allFinished.filter((i) => {
					if (!i.candidateStatus || i.candidateStatus === 'Pending') {
						return false
					}
					return Boolean(i.dateSelect && i.date)
				})
				const decidedDays: number[] = decided
					.map((i) => {
						const decisionDate = new Date(i.dateSelect as unknown as Date)
						const interviewDate = new Date(i.date as unknown as Date)
						const ms = decisionDate.getTime() - interviewDate.getTime()
						if (!Number.isFinite(ms) || ms < 0) return null
						return Math.floor(ms / (24 * 60 * 60 * 1000))
					})
					.filter((d): d is number => d !== null)
				const avgFeedbackTimeDays =
					decidedDays.length > 0
						? Math.round(
								decidedDays.reduce((s, d) => s + d, 0) /
									decidedDays.length,
							)
						: null

				const response = { items, avgFeedbackTimeDays }
				if (!noCache) {
					inboxCache.set(companyId, {
						data: response,
						expiresAt: now.getTime() + INBOX_CACHE_TTL,
					})
				}
				return response
			},
		)
}
