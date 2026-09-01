import type {
	ApplicationDraft,
	Company,
	JobApplied,
	PostJob,
	User,
	CandidateSource,
	VerifiedOtsAttestation,
} from '@coploy/domain'
import { DEFAULT_CANDIDATE_SOURCE } from '@coploy/domain'
import { REJECTION_REASON_TAXONOMY_VERSION, findRejectionReason } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { createOutboxWriter } from '@/lib/events/outbox-writer'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
	buildKnockoutRejectionEvidence,
	resolveFailedKnockoutRequirementLabel,
} from '@/lib/services/candidate-rejection-mirror'
import { createOtsVerificationService } from '@/lib/services/ots-verification-service'
import { createPessoaService } from '@/lib/services/pessoa-identity-service'
import {
	evaluateScreeningKnockout,
	type ScreeningKnockoutAnswers,
} from '@/lib/services/screening-knockout-service'

const KNOCKOUT_REJECTION_REASON_CODE = 'nao_atende_requisitos'
/** Estágio kanban-compatível do apply leve (TOS-020). */
export const APPLY_LITE_STATUS = 'Applied'

/** Status finais: apply leve não muta nem re-rejeita. */
const TERMINAL_CANDIDATE_STATUSES = new Set(['Approved', 'Rejected'])

function isTerminalCandidateStatus(status: unknown): boolean {
	return typeof status === 'string' && TERMINAL_CANDIDATE_STATUSES.has(status)
}

export type ApplyLiteAction = 'continue_interview' | 'rejected'

export interface ApplyLiteInput {
	companyId: string
	jobId: string
	candidateUserId: string
	name?: string | null
	email?: string | null
	phone?: string | null
	cpf?: string | null
	resumeUrl?: string | null
	notes?: string | null
	/** Respostas de knockout opcionais — se a vaga tiver árvore e vierem, avalia agora. */
	knockoutAnswers?: ScreeningKnockoutAnswers | null
	/** Origem da candidatura (V2-601). Default `careers` nesta porta. */
	source?: CandidateSource | null
	sourceDetail?: string | null
	/**
	 * Prova de entrevista verificada (OTS 0.2) que o candidato quer anexar.
	 * Falha na verificação NUNCA bloqueia a candidatura — só a prova fica de
	 * fora, e o resultado diz por quê.
	 */
	otsAttestationJws?: string | null
}

export interface ApplyLiteResult {
	jobAppliedId: string
	companyId: string
	jobId: string
	created: boolean
	appliedWithoutInterview: true
	candidateStatus: string
	action: ApplyLiteAction
	interviewUrlPath: string
	rejectionReasonCode: string | null
	rejectionReasonLabel: string | null
	rejectionEvidence: string | null
	knockoutPassed: boolean | null
	/** Resultado do anexo da prova OTS — null quando nenhuma foi enviada. */
	otsAttestation: { accepted: boolean; reason: string | null } | null
}

function hasKnockoutNodes(job: PostJob): boolean {
	return Boolean(job.knockoutTree && Array.isArray(job.knockoutTree.nodes) && job.knockoutTree.nodes.length > 0)
}

function isJobOpen(job: PostJob): boolean {
	if (job.stopped === true || job.archived === true) return false
	if (job.closingDate) {
		const closing = job.closingDate instanceof Date
			? job.closingDate
			: new Date(String(job.closingDate))
		if (!Number.isNaN(closing.getTime()) && closing.getTime() < Date.now()) return false
	}
	return true
}

/**
 * Único ponto de decisão do apply leve (feature flag `applyLite`).
 * Default OFF — ausência/false = fluxo entrevista-first inalterado.
 */
export function isApplyLiteAllowed(company: Company | null, _job: PostJob): boolean {
	return isFeatureEnabled(company, 'applyLite')
}

function buildEmptyInterviewSkeleton(job: PostJob) {
	const interviewInfo = (job.jobQuestions ?? []).map((q) => ({
		id: q.id,
		question: q.question,
		answer: '',
		finished: false,
		video: '',
		skills: q.skills ?? '',
	}))
	const additionalQuestions = (job.additionalQuestions ?? []).map((q) => ({
		id: q.id,
		question: q.question,
		answer: '',
		finished: false,
		video: '',
	}))
	return {
		info: interviewInfo,
		addicional: additionalQuestions,
	}
}

function buildDraft(input: ApplyLiteInput): ApplicationDraft | null {
	const draft: ApplicationDraft = {}
	if (input.name) draft.name = input.name
	if (input.email) draft.email = input.email
	if (input.phone) draft.phone = input.phone
	if (input.resumeUrl) draft.resumeUrl = input.resumeUrl
	if (input.notes) draft.notes = input.notes
	return Object.keys(draft).length > 0 ? draft : null
}

async function findExistingApplication(
	infra: InfraProvider,
	userId: string,
	jobId: string,
): Promise<JobApplied | null> {
	// field deve ser 'jobApplied.id' — JA_FIELD_MAP do selfhosted só mapeia essa chave;
	// 'jobApplied' é descartado silenciosamente e devolve a 1ª candidatura de qualquer vaga.
	const jobsApplied = (await infra.candidateRepository.listJobsApplied(userId, {
		filters: [{ field: 'jobApplied.id', operator: '==', value: jobId }],
		limitTo: 1,
	})) as JobApplied[]
	return jobsApplied.at(0) ?? null
}

function toNumberScore(value: unknown): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : 0
	}
	return 0
}

export function createJobApplicationService(infra: InfraProvider) {
	const outbox = createOutboxWriter(infra)
	const otsVerification = createOtsVerificationService()
	const pessoaService = createPessoaService(infra)

	async function syncViews(params: {
		userId: string
		jobAppliedId: string
		companyId: string
		jobId: string
		job: PostJob
		jobApplied: JobApplied
		user: User | null
	}) {
		const { userId, jobAppliedId, companyId, jobId, job, jobApplied, user } = params
		const u = (user ?? {}) as Record<string, unknown>
		const interviewData = {
			job_applied_ref: { id: jobAppliedId, path: `users/${userId}/jobsApplied/${jobAppliedId}` },
			user_ref: { id: userId, path: `users/${userId}` },
			job_ref: { id: jobId, path: `companies/${companyId}/postJob/${jobId}` },
			identifier: String((job as { identifier?: string | null }).identifier ?? ''),
			finished: Boolean(jobApplied.finished),
			finish: Boolean(jobApplied.finished),
			name: String(u.display_name ?? jobApplied.applicationDraft?.name ?? ''),
			score: toNumberScore(jobApplied.interview?.score ?? jobApplied.score),
			date: jobApplied.appliedTime ?? new Date(),
			date_select: jobApplied.dateSelect ?? jobApplied.appliedTime ?? new Date(),
			finishedTime: jobApplied.finishedTime ?? null,
			photo_url: String(u.photo_url ?? ''),
			occupation: String(u.occupation ?? ''),
			external_id: String(u.external_id ?? ''),
			professional_experience: String(u.professionalExperience ?? ''),
			phone_number: String(u.phone_number ?? jobApplied.applicationDraft?.phone ?? ''),
			state: String(u.state ?? ''),
			city: String(u.city ?? ''),
			email: String(u.email ?? jobApplied.applicationDraft?.email ?? ''),
			career_level: String(job.carrerLevel ?? ''),
			job_name: String(job.jobName ?? ''),
			job_description: String(job.jobDescription ?? ''),
			type_interview: String(job.typeInterview ?? ''),
			stopped: Boolean(job.stopped ?? false),
			candidate_status: jobApplied.candidateStatus ?? APPLY_LITE_STATUS,
			appliedWithoutInterview: true,
			// origem espelhada (V2-601): o analytics lê companyInterviews, não o
			// jobApplied — sem o espelho o corte por origem sairia sempre vazio
			source: jobApplied.source ?? DEFAULT_CANDIDATE_SOURCE,
			sourceDetail: jobApplied.sourceDetail ?? null,
		}

		await Promise.all([
			infra.candidateRepository.setJobInterview(
				companyId,
				jobId,
				jobAppliedId,
				interviewData as never,
			),
			infra.candidateRepository.setCompanyInterview(
				companyId,
				jobAppliedId,
				interviewData as never,
			),
		])
	}

	async function enrichCandidateProfile(input: ApplyLiteInput) {
		const { candidateUserId, name, phone, email, resumeUrl, cpf } = input
		/*
		 * PREENCHE, nunca sobrescreve: o formulário de candidatura é fonte
		 * FRACA de identidade — clientes mandavam nome chutado (prefixo do
		 * e-mail) e isto apagava o nome real cadastrado. O que já existe no
		 * perfil vence; o apply só completa lacunas.
		 */
		const current = (await infra.userRepository
			.getUser(candidateUserId)
			.catch(() => null)) as {
			display_name?: string | null
			phone_number?: string | null
			email?: string | null
		} | null
		const identity: Record<string, unknown> = {}
		if (name && !current?.display_name) identity.display_name = name
		if (phone && !current?.phone_number) identity.phone_number = phone
		if (email && !current?.email) identity.email = email
		if (Object.keys(identity).length > 0) {
			await infra.userRepository.updateUser(candidateUserId, identity).catch((error) => {
				console.error('[ApplyLite] updateUser failed:', error instanceof Error ? error.message : 'unknown')
			})
		}

		const cpfTrimmed = typeof cpf === 'string' ? cpf.trim() : ''
		if (cpfTrimmed) {
			try {
				await pessoaService.upsertByCpf({
					cpf: cpfTrimmed,
					userId: candidateUserId,
					candidateProfileId: candidateUserId,
					displayName: name ?? undefined,
				})
			} catch (error) {
				console.error(
					'[ApplyLite] pessoa upsert failed:',
					error instanceof Error ? error.message : 'unknown',
				)
			}
		}

		if (resumeUrl) {
			await infra.userRepository
				.updateCandidateProfile(candidateUserId, { resumeUrl } as never)
				.catch(() => undefined)
		}
	}

	async function applyKnockoutIfNeeded(params: {
		companyId: string
		jobId: string
		job: PostJob
		candidateUserId: string
		jobAppliedId: string
		answers: ScreeningKnockoutAnswers | null | undefined
	}): Promise<{
		action: ApplyLiteAction
		rejectionReasonCode: string | null
		rejectionReasonLabel: string | null
		rejectionEvidence: string | null
		knockoutPassed: boolean | null
		candidateStatus: string
	}> {
		const { companyId, jobId, job, candidateUserId, jobAppliedId, answers } = params
		if (!hasKnockoutNodes(job) || !answers || Object.keys(answers).length === 0) {
			return {
				action: 'continue_interview',
				rejectionReasonCode: null,
				rejectionReasonLabel: null,
				rejectionEvidence: null,
				knockoutPassed: null,
				candidateStatus: APPLY_LITE_STATUS,
			}
		}

		const evaluation = evaluateScreeningKnockout(job.knockoutTree, answers)
		const now = new Date()
		const resultPayload = {
			treeVersion: job.knockoutTree?.version ?? null,
			passed: evaluation.passed,
			score: evaluation.score,
			failedNodeIds: evaluation.failedNodeIds,
			rejectionReasonCode: evaluation.rejectionReasonCode,
			evaluatedAt: now,
		}
		const baseUpdate = {
			screeningKnockoutAnswers: answers,
			screeningKnockoutResult: resultPayload,
			screeningKnockoutTreeSnapshot: job.knockoutTree,
			updated_at: now.toISOString(),
		}

		if (evaluation.passed) {
			await infra.candidateRepository.updateJobApplied(candidateUserId, jobAppliedId, baseUpdate)
			return {
				action: 'continue_interview',
				rejectionReasonCode: null,
				rejectionReasonLabel: null,
				rejectionEvidence: null,
				knockoutPassed: true,
				candidateStatus: APPLY_LITE_STATUS,
			}
		}

		const reason = findRejectionReason(KNOCKOUT_REJECTION_REASON_CODE)
		const requirementLabel = resolveFailedKnockoutRequirementLabel(
			job.knockoutTree,
			evaluation.failedNodeIds,
		)
		const rejectionEvidence = requirementLabel
			? buildKnockoutRejectionEvidence(requirementLabel)
			: null
		const rejectionUpdate = {
			...baseUpdate,
			candidateStatus: 'Rejected',
			candidate_status: 'Rejected',
			dateSelect: now,
			date_select: now,
			rejectionReasonCode: reason?.code ?? KNOCKOUT_REJECTION_REASON_CODE,
			rejectionReasonLabel: reason?.label ?? 'Não atende aos requisitos',
			rejectionDecisionSource: 'knockout' as const,
			rejectionDecidedByUserId: null,
			rejectionTaxonomyVersion: REJECTION_REASON_TAXONOMY_VERSION,
			rejectionEvidence,
		}
		await infra.candidateRepository.updateJobApplied(candidateUserId, jobAppliedId, rejectionUpdate)

		const jobInterview = await infra.candidateRepository.getJobInterview(companyId, jobId, jobAppliedId)
		if (jobInterview) {
			await infra.candidateRepository.updateJobInterview(companyId, jobId, jobAppliedId, rejectionUpdate)
		}
		const companyInterview = await infra.candidateRepository.getCompanyInterview(companyId, jobAppliedId)
		if (companyInterview) {
			await infra.candidateRepository.updateCompanyInterview(companyId, companyInterview.id, rejectionUpdate)
		}

		try {
			await outbox.write({
				type: 'screening_knockout',
				companyId,
				payload: {
					applicationId: jobAppliedId,
					jobId,
					reasonCode: KNOCKOUT_REJECTION_REASON_CODE,
					reasonLabel: reason?.label,
					rejectionEvidence,
					passed: false,
					score: evaluation.score,
					failedNodeIds: evaluation.failedNodeIds,
					occurredAt: now.toISOString(),
				},
			})
		} catch (error) {
			console.error('[ApplyLite] failed to write screening_knockout event:', error)
		}

		return {
			action: 'rejected',
			rejectionReasonCode: reason?.code ?? KNOCKOUT_REJECTION_REASON_CODE,
			rejectionReasonLabel: reason?.label ?? 'Não atende aos requisitos',
			rejectionEvidence,
			knockoutPassed: false,
			candidateStatus: 'Rejected',
		}
	}

	return {
		isApplyLiteAllowed,

		/**
		 * Apply leve (TOS-020): registra candidatura SEM mídia.
		 * Idempotente com o lazy-create do orchestrator — mesma chave
		 * (userId + jobApplied ref). Não altera createJobAppliedIfNotExists.
		 */
		async applyLite(input: ApplyLiteInput): Promise<ApplyLiteResult> {
			const { companyId, jobId, candidateUserId } = input
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!jobId) throw new BadRequestError('jobId is required')
			if (!candidateUserId) throw new BadRequestError('candidateUserId is required')

			const [company, job] = await Promise.all([
				infra.companyRepository.getCompany(companyId) as Promise<Company | null>,
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
			])
			if (!company) throw new NotFoundError('Company not found')
			if (!job) throw new NotFoundError('Job not found')

			// Gate concentrado: sem flag → recurso indisponível (não vaza feature interna).
			if (!isApplyLiteAllowed(company, job)) {
				throw new NotFoundError('Job not found')
			}

			if (!isJobOpen(job)) throw new BadRequestError('Job is not open for applications')

			await enrichCandidateProfile(input)

			const existing = await findExistingApplication(infra, candidateUserId, jobId)
			let jobApplied = existing
			let created = false
			const draft = buildDraft(input)
			const user = (await infra.userRepository.getUser(candidateUserId).catch(() => null)) as User | null
			const interviewUrlPath = `/job/${jobId}/company/${companyId}/login`

			// Candidatura terminal (Approved/Rejected): não sobrescreve draft, não
			// marca appliedWithoutInterview e não re-rejeita via knockout. Resposta
			// reflete o status real — nunca inventa 'Applied'.
			if (jobApplied && isTerminalCandidateStatus(jobApplied.candidateStatus)) {
				const status = String(jobApplied.candidateStatus)
				const rejected = status === 'Rejected'
				return {
					jobAppliedId: jobApplied.id,
					companyId,
					jobId,
					created: false,
					appliedWithoutInterview: true,
					candidateStatus: status,
					action: rejected ? 'rejected' : 'continue_interview',
					interviewUrlPath,
					rejectionReasonCode: rejected
						? (jobApplied.rejectionReasonCode ?? null)
						: null,
					rejectionReasonLabel: rejected
						? (jobApplied.rejectionReasonLabel ?? null)
						: null,
					rejectionEvidence: rejected
						? (jobApplied.rejectionEvidence ?? null)
						: null,
					knockoutPassed: null,
					// Candidatura encerrada não recebe anexo novo.
					otsAttestation: null,
				}
			}

			// Prova OTS: verificada ANTES da criação pra nascer junto do doc.
			// Falha nunca derruba o apply — a candidatura vale sem prova.
			let otsOutcome: ApplyLiteResult['otsAttestation'] = null
			let verifiedOts: VerifiedOtsAttestation | null = null
			if (input.otsAttestationJws?.trim()) {
				const candidateEmail =
					input.email ?? (user as { email?: string | null } | null)?.email ?? null
				const verification = await otsVerification
					.verify(input.otsAttestationJws, candidateEmail)
					.catch(() => ({ ok: false as const, reason: 'jwks_unreachable' as const }))
				if (verification.ok) {
					verifiedOts = verification.attestation
					otsOutcome = { accepted: true, reason: null }
				} else {
					otsOutcome = { accepted: false, reason: verification.reason }
				}
			}

			if (!jobApplied) {
				const now = new Date()
				const data: Record<string, unknown> = {
					jobApplied: { id: jobId },
					userApplied: { id: candidateUserId },
					appliedTime: now,
					finished: false,
					companyOwner: { id: companyId },
					typeInterview: job.typeInterview ?? 'interview',
					interviewMode: job.interviewMode ?? 'video',
					candidateStatus: APPLY_LITE_STATUS,
					appliedWithoutInterview: true,
					applicationDraft: draft,
					interview: buildEmptyInterviewSkeleton(job),
					// origem gravada UMA vez, na criação: se o candidato voltar por
					// outro link, quem trouxe a pessoa continua sendo o primeiro
					source: input.source ?? 'careers',
					sourceDetail: input.sourceDetail ?? null,
					otsAttestation: verifiedOts,
				}
				jobApplied = (await infra.candidateRepository.createJobApplied(
					candidateUserId,
					data as never,
				)) as JobApplied & { id: string }
				created = true

				await syncViews({
					userId: candidateUserId,
					jobAppliedId: jobApplied.id,
					companyId,
					jobId,
					job,
					jobApplied: {
						...jobApplied,
						appliedTime: now,
						candidateStatus: APPLY_LITE_STATUS,
						applicationDraft: draft,
						appliedWithoutInterview: true,
					},
					user,
				}).catch((error) => {
					console.error('[ApplyLite] syncViews failed:', error)
				})

				await infra.jobRepository
					.syncPostJobUsersApplied(companyId, jobId, candidateUserId)
					.catch((error) => {
						console.error('[ApplyLite] syncPostJobUsersApplied failed:', error)
					})

				try {
					await outbox.write({
						type: 'candidatura_criada',
						companyId,
						payload: {
							applicationId: jobApplied.id,
							jobId,
							candidateId: candidateUserId,
							occurredAt: now.toISOString(),
							source: 'apply_lite',
							appliedWithoutInterview: true,
						},
					})
				} catch (error) {
					console.error('[ApplyLite] failed to write candidatura_criada:', error)
				}
			} else if (draft) {
				await infra.candidateRepository
					.updateJobApplied(candidateUserId, jobApplied.id, {
						applicationDraft: {
							...(jobApplied.applicationDraft ?? {}),
							...draft,
						},
						appliedWithoutInterview: true,
					} as never)
					.catch(() => undefined)
			}

			// Candidatura que já existia ganha a prova por update próprio (a
			// criação já a levou no doc). Falha de gravação não derruba o apply.
			if (verifiedOts && !created) {
				await infra.candidateRepository
					.updateJobApplied(candidateUserId, jobApplied.id, {
						otsAttestation: verifiedOts,
					} as never)
					.catch(() => undefined)
			}

			const knockout = await applyKnockoutIfNeeded({
				companyId,
				jobId,
				job,
				candidateUserId,
				jobAppliedId: jobApplied.id,
				answers: input.knockoutAnswers,
			})

			return {
				jobAppliedId: jobApplied.id,
				companyId,
				jobId,
				created,
				appliedWithoutInterview: true,
				candidateStatus: knockout.candidateStatus,
				action: knockout.action,
				interviewUrlPath,
				rejectionReasonCode: knockout.rejectionReasonCode,
				rejectionReasonLabel: knockout.rejectionReasonLabel,
				rejectionEvidence: knockout.rejectionEvidence,
				knockoutPassed: knockout.knockoutPassed,
				otsAttestation: otsOutcome,
			}
		},
	}
}

export type JobApplicationService = ReturnType<typeof createJobApplicationService>
