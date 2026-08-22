import type { Company, CompanyInterview, PostJob } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { PostmarkClient } from '@/lib/postmark-client'
import { renderApplicationAckEmail } from '@/emails/application-ack'
import {
	createEmailTemplateResolver,
	withCustomSubject,
} from '@/lib/services/email-template-resolver'
import { renderSlaAlertEmail } from '@/emails/sla-alert'
import { createOutboxWriter } from '@/lib/events/outbox-writer'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { ANTI_GHOSTING_CONFIG } from '@/lib/services/anti-ghosting-config'
import {
	computeSlaMetrics,
	isGracePeriodExpired,
	isTerminalDecisionStatus,
	resolveAppliedAt,
} from '@/lib/services/anti-ghosting-sla-metrics'
import { BadRequestError } from '@coploy/shared/errors'

const ACK_FROM_EMAIL = 'no-reply@coploy.io'
const SLA_ALERT_FROM_EMAIL = 'no-reply@coploy.io'

export type AntiGhostingEmailClient = EmailSender

export type AntiGhostingSlaRunResult = {
	companiesScanned: number
	jobsScanned: number
	acksSent: number
	alertsSent: number
	jobsAutoStopped: number
	jobsReopened: number
}

type JobWithCompany = PostJob & { companyId: string }

function asDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function resolveSlaHours(job: Pick<PostJob, 'feedbackSlaHours'>): number {
	const hours = job.feedbackSlaHours
	if (typeof hours === 'number' && Number.isFinite(hours) && hours > 0) return hours
	return ANTI_GHOSTING_CONFIG.defaultFeedbackSlaHours
}

export function createAntiGhostingSlaService(
	infra: InfraProvider,
	emailClient: AntiGhostingEmailClient = createEmailSender(infra),
) {
	const outbox = createOutboxWriter(infra)
	const templates = createEmailTemplateResolver(infra)

	/**
	 * Precedência: flag do tenant (`antiGhosting`) → toggle da vaga.
	 * Company sem flag: zero efeito, mesmo com `PostJob.antiGhostingEnabled === true`.
	 * Filtro ANTES de qualquer side-effect (e-mail, status, outbox).
	 */
	async function listAntiGhostingJobs(companies: Company[]): Promise<JobWithCompany[]> {
		const jobs: JobWithCompany[] = []

		for (const company of companies) {
			if (!isFeatureEnabled(company, 'antiGhosting')) continue

			const companyJobs = await infra.jobRepository.listJobs(company.id)
			for (const job of companyJobs) {
				// Zero backfill: só vagas com flag explícita true entram no fluxo.
				if (job.antiGhostingEnabled !== true) continue
				if (job.archived === true) continue
				jobs.push({ ...job, companyId: company.id })
			}
		}

		return jobs
	}

	async function persistAckSentAt(params: {
		companyId: string
		job: PostJob
		interview: CompanyInterview
		ackSentAt: Date | null
	}): Promise<void> {
		const { companyId, job, interview, ackSentAt } = params
		const ackPayload = { ackSentAt }
		const interviewId = interview.id
		const userUid = interview.user_id || interview.user_ref?.id
		const jobAppliedId = interview.job_applied_ref?.id || interviewId
		const postJobId = interview.post_job_id || job.id

		await infra.candidateRepository.updateJobInterview(companyId, postJobId, interviewId, ackPayload)
		await infra.candidateRepository.updateCompanyInterview(companyId, interviewId, ackPayload)
		if (userUid && jobAppliedId) {
			await infra.candidateRepository.updateJobApplied(userUid, jobAppliedId, ackPayload)
		}
	}

	async function sendAckForInterview(params: {
		companyId: string
		job: PostJob
		interview: CompanyInterview
		now: Date
	}): Promise<boolean> {
		const { companyId, job, interview, now } = params
		if (interview.ackSentAt) return false
		if (isTerminalDecisionStatus(interview.candidateStatus)) return false

		const appliedAt = resolveAppliedAt(interview)
		if (!appliedAt) return false

		const candidateEmail = interview.email?.trim()
		if (!candidateEmail) return false

		const interviewId = interview.id
		const userUid = interview.user_id || interview.user_ref?.id
		const jobAppliedId = interview.job_applied_ref?.id || interviewId
		const postJobId = interview.post_job_id || job.id

		// Marca antes do envio: sob falha parcial de write o e-mail não sai;
		// na próxima rodada, se JobInterview já tiver ackSentAt, também não reenvia.
		await persistAckSentAt({ companyId, job, interview, ackSentAt: now })

		/*
		 * O ack é o e-mail que o candidato recebe primeiro, e é a cara da empresa
		 * — não a nossa. Só o assunto é customizável aqui: o corpo do ack é curto
		 * e o que ele precisa dizer ("recebemos, você terá resposta até X") é
		 * exatamente a promessa do anti-ghosting, que não deve poder ser apagada
		 * editando um texto.
		 */
		const custom = await templates.resolve(companyId, 'application_ack', {
			candidato: interview.name,
			vaga: interview.jobName || job.jobName,
			empresa: job.companyName,
		})

		const rendered = withCustomSubject(
			renderApplicationAckEmail({
				candidateName: interview.name,
				jobName: interview.jobName || job.jobName,
				companyName: job.companyName,
				language: job.language,
			}),
			custom.subject,
		)

		try {
			await emailClient.sendEmail({
				from: ACK_FROM_EMAIL,
				to: candidateEmail,
				subject: rendered.subject,
				htmlBody: rendered.htmlBody,
				textBody: rendered.textBody,
				tag: 'application-ack',
			})
		} catch (error) {
			try {
				await persistAckSentAt({ companyId, job, interview, ackSentAt: null })
			} catch (revertError) {
				console.error(
					'[anti-ghosting] CRITICAL: failed to revert ackSentAt after Postmark failure',
					{
						companyId,
						interviewId,
						jobAppliedId,
						postJobId,
						userUid,
						postmarkError: error,
						revertError,
					},
				)
			}
			throw error
		}

		try {
			await outbox.write({
				type: 'feedback_enviado',
				companyId,
				payload: {
					applicationId: jobAppliedId,
					jobId: postJobId,
					channel: 'email',
					sentAt: now.toISOString(),
					templateId: 'application-ack',
					occurredAt: now.toISOString(),
				},
			})
		} catch (error) {
			console.error('[anti-ghosting] failed to write ack outbox event (non-fatal)', {
				companyId,
				interviewId,
				jobAppliedId,
				postJobId,
				error,
			})
		}

		return true
	}

	async function sendSlaAlert(params: {
		companyId: string
		job: PostJob
		metrics: ReturnType<typeof computeSlaMetrics>
		now: Date
	}): Promise<boolean> {
		const { companyId, job, metrics, now } = params
		const to = job.creatorEmail?.trim()
		if (!to) return false

		const ratioPercent = Math.round(metrics.ratio * 100)
		const rendered = renderSlaAlertEmail({
			recruiterName: job.creatorName,
			jobName: job.jobName,
			companyName: job.companyName,
			overdueCount: metrics.overdueWithoutDecisionCount,
			activeCount: metrics.activeCount,
			ratioPercent,
			gracePeriodHours: ANTI_GHOSTING_CONFIG.gracePeriodHours,
			language: job.language,
		})

		await emailClient.sendEmail({
			from: SLA_ALERT_FROM_EMAIL,
			to,
			subject: rendered.subject,
			htmlBody: rendered.htmlBody,
			textBody: rendered.textBody,
			tag: 'sla-alert',
		})

		try {
			await outbox.write({
				type: 'vaga_sla_alerta',
				companyId,
				payload: {
					jobId: job.id,
					overdueCount: metrics.overdueWithoutDecisionCount,
					activeCount: metrics.activeCount,
					ratio: metrics.ratio,
					alertedAt: now.toISOString(),
					occurredAt: now.toISOString(),
				},
			})
		} catch (error) {
			console.warn('[anti-ghosting] failed to write sla alert outbox event', error)
		}

		return true
	}

	async function processJob(
		job: JobWithCompany,
		now: Date,
		result: AntiGhostingSlaRunResult,
	): Promise<void> {
		const companyId = job.companyId
		const interviews = await infra.candidateRepository.listJobInterviews(companyId, job.id)
		const slaHours = resolveSlaHours(job)

		for (const interview of interviews) {
			const sent = await sendAckForInterview({ companyId, job, interview, now })
			if (sent) result.acksSent += 1
		}

		const metrics = computeSlaMetrics(interviews, slaHours, now)
		const irregularSince = asDate(job.slaIrregularSince)

		if (metrics.isIrregular) {
			const patch: Record<string, unknown> = {}

			if (!irregularSince) {
				patch.slaIrregularSince = now
				const alerted = await sendSlaAlert({ companyId, job, metrics, now })
				if (alerted) {
					patch.slaAlertSentAt = now
					result.alertsSent += 1
				}
			} else if (!job.slaAlertSentAt) {
				const alerted = await sendSlaAlert({ companyId, job, metrics, now })
				if (alerted) {
					patch.slaAlertSentAt = now
					result.alertsSent += 1
				}
			}

			const since = asDate((patch.slaIrregularSince as Date | undefined) ?? irregularSince) ?? now
			const alreadyAutoStopped = job.slaAutoStoppedByAntiGhosting === true
			if (!alreadyAutoStopped && isGracePeriodExpired(since, now)) {
				patch.stopped = true
				patch.slaAutoStoppedAt = now
				patch.slaAutoStoppedByAntiGhosting = true
				patch.slaPublicBeforeAutoStop = job.public === true
				if (job.public === true) {
					patch.public = false
				}
				result.jobsAutoStopped += 1

				try {
					await outbox.write({
						type: 'vaga_sla_auto_stopped',
						companyId,
						payload: {
							jobId: job.id,
							stoppedAt: now.toISOString(),
							ratio: metrics.ratio,
							occurredAt: now.toISOString(),
						},
					})
				} catch (error) {
					console.warn('[anti-ghosting] failed to write auto-stop outbox event', error)
				}
			}

			if (Object.keys(patch).length > 0) {
				await infra.jobRepository.updateJob(companyId, job.id, patch)
			}
			return
		}

		const patch: Record<string, unknown> = {}
		if (irregularSince || job.slaAlertSentAt) {
			patch.slaIrregularSince = null
			patch.slaAlertSentAt = null
		}

		if (job.slaAutoStoppedByAntiGhosting === true) {
			patch.stopped = false
			patch.slaAutoStoppedAt = null
			patch.slaAutoStoppedByAntiGhosting = false
			if (job.slaPublicBeforeAutoStop === true) {
				patch.public = true
			}
			patch.slaPublicBeforeAutoStop = null
			result.jobsReopened += 1

			try {
				await outbox.write({
					type: 'vaga_sla_regularizada',
					companyId,
					payload: {
						jobId: job.id,
						regularizedAt: now.toISOString(),
						ratio: metrics.ratio,
						occurredAt: now.toISOString(),
					},
				})
			} catch (error) {
				console.warn('[anti-ghosting] failed to write regularized outbox event', error)
			}
		}

		if (Object.keys(patch).length > 0) {
			await infra.jobRepository.updateJob(companyId, job.id, patch)
		}
	}

	return {
		async run(now: Date = new Date()): Promise<AntiGhostingSlaRunResult> {
			const result: AntiGhostingSlaRunResult = {
				companiesScanned: 0,
				jobsScanned: 0,
				acksSent: 0,
				alertsSent: 0,
				jobsAutoStopped: 0,
				jobsReopened: 0,
			}

			const companies = await infra.companyRepository.listCompanies()
			// Conta só tenants com a flag — os demais nem entram no pipeline.
			const enabledCompanies = companies.filter((c) => isFeatureEnabled(c, 'antiGhosting'))
			result.companiesScanned = enabledCompanies.length

			const jobs = await listAntiGhostingJobs(companies)
			result.jobsScanned = jobs.length

			for (const job of jobs) {
				await processJob(job, now, result)
			}

			return result
		},

		async assertCanPublishOrUnstop(params: {
			companyId: string
			job: PostJob
			/** Company já resolvida pelo caller — evita refetch. */
			company?: Pick<Company, 'id' | 'featureFlags'> | null
			wantsPublic?: boolean
			wantsUnstop?: boolean
			now?: Date
		}): Promise<void> {
			const { companyId, job, wantsPublic, wantsUnstop } = params
			if (!wantsPublic && !wantsUnstop) return

			// Precedência tenant → vaga: sem flag do tenant, gate de publicação é no-op.
			const company =
				params.company ?? (await infra.companyRepository.getCompany(companyId))
			if (!isFeatureEnabled(company, 'antiGhosting')) return
			if (job.antiGhostingEnabled !== true) return

			const interviews = await infra.candidateRepository.listJobInterviews(companyId, job.id)
			const metrics = computeSlaMetrics(
				interviews,
				resolveSlaHours(job),
				params.now ?? new Date(),
			)

			if (metrics.isIrregular) {
				throw new BadRequestError(
					'Esta vaga está irregular no SLA anti-ghosting e não pode ficar pública até regularizar as candidaturas atrasadas.',
				)
			}
		},

		computeSlaMetrics,
	}
}

export type AntiGhostingSlaService = ReturnType<typeof createAntiGhostingSlaService>
