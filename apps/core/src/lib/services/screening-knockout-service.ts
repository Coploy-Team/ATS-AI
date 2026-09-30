import type {
	JobApplied,
	PostJob,
	ScreeningKnockoutNode,
	ScreeningKnockoutRuleValue,
	ScreeningKnockoutTree,
} from '@coploy/domain'
import { REJECTION_REASON_TAXONOMY_VERSION, findRejectionReason } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { createOutboxWriter } from '@/lib/events/outbox-writer'
import {
	buildKnockoutRejectionEvidence,
	resolveCandidateFacingRejectionExplanation,
	resolveFailedKnockoutRequirementLabel,
} from '@/lib/services/candidate-rejection-mirror'

const KNOCKOUT_REJECTION_REASON_CODE = 'nao_atende_requisitos'

export type ScreeningKnockoutAnswers = Record<string, unknown>

export interface ScreeningKnockoutEvaluation {
	passed: boolean
	score: number
	failedNodeIds: string[]
	rejectionReasonCode: string | null
}

export interface SubmitScreeningKnockoutResult extends ScreeningKnockoutEvaluation {
	action: 'continue_interview' | 'rejected'
	jobAppliedId: string
	jobId: string
	companyId: string
	/** Explicação humana canônica (mesma string gravada na candidatura e no outbox). */
	rejectionEvidence: string | null
	/** Label do requisito falho — pra copy i18n no espelho do candidato. */
	failedRequirementLabel: string | null
}

function hasNodes(tree: ScreeningKnockoutTree | null | undefined): tree is ScreeningKnockoutTree {
	return Boolean(tree && Array.isArray(tree.nodes) && tree.nodes.length > 0)
}

function normalizeWeight(node: ScreeningKnockoutNode): number {
	const weight = node.weight ?? 1
	return Number.isFinite(weight) && weight > 0 ? weight : 1
}

function normalizeComparable(value: unknown, type: ScreeningKnockoutNode['type']): string | number | boolean | null {
	if (value === null || value === undefined || value === '') return null
	if (type === 'boolean') {
		if (typeof value === 'boolean') return value
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase()
			if (['true', 'sim', 'yes', '1'].includes(normalized)) return true
			if (['false', 'nao', 'não', 'no', '0'].includes(normalized)) return false
		}
		return null
	}
	if (type === 'number') {
		if (typeof value === 'number') return Number.isFinite(value) ? value : null
		if (typeof value === 'string') {
			const parsed = Number.parseFloat(value)
			return Number.isFinite(parsed) ? parsed : null
		}
		return null
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}
	return null
}

function normalizeRuleValue(
	value: ScreeningKnockoutRuleValue,
	type: ScreeningKnockoutNode['type'],
): string | number | boolean | Array<string | number | boolean> | null {
	if (Array.isArray(value)) {
		return value
			.map((item) => normalizeComparable(item, type))
			.filter((item): item is string | number | boolean => item !== null)
	}
	return normalizeComparable(value, type)
}

function compareNode(node: ScreeningKnockoutNode, rawAnswer: unknown): boolean {
	const answer = normalizeComparable(rawAnswer, node.type)
	const expected = normalizeRuleValue(node.rule.value, node.type)

	if (answer === null) return false

	switch (node.rule.operator) {
		case 'equals':
			return answer === expected
		case 'not_equals':
			return answer !== expected
		case 'greater_than':
			return typeof answer === 'number' && typeof expected === 'number' && answer > expected
		case 'greater_than_or_equal':
			return typeof answer === 'number' && typeof expected === 'number' && answer >= expected
		case 'less_than':
			return typeof answer === 'number' && typeof expected === 'number' && answer < expected
		case 'less_than_or_equal':
			return typeof answer === 'number' && typeof expected === 'number' && answer <= expected
		case 'in':
			return Array.isArray(expected) && expected.includes(answer)
		case 'not_in':
			return Array.isArray(expected) && !expected.includes(answer)
		default:
			return false
	}
}

export function evaluateScreeningKnockout(
	tree: ScreeningKnockoutTree | null | undefined,
	answers: ScreeningKnockoutAnswers,
): ScreeningKnockoutEvaluation {
	if (!hasNodes(tree)) {
		return {
			passed: true,
			score: 0,
			failedNodeIds: [],
			rejectionReasonCode: null,
		}
	}

	let totalWeight = 0
	let passedWeight = 0
	const failedNodeIds: string[] = []
	let hasKnockoutFailure = false

	for (const node of tree.nodes) {
		const weight = normalizeWeight(node)
		totalWeight += weight
		const didPass = compareNode(node, answers[node.id])
		if (didPass) {
			passedWeight += weight
			continue
		}
		failedNodeIds.push(node.id)
		if (node.onFail === 'knockout') hasKnockoutFailure = true
	}

	const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 10000) / 100 : 0
	return {
		passed: !hasKnockoutFailure,
		score,
		failedNodeIds,
		rejectionReasonCode: hasKnockoutFailure ? KNOCKOUT_REJECTION_REASON_CODE : null,
	}
}

function refId(ref: JobApplied['jobApplied']): string | null {
	if (!ref) return null
	return ref.id ?? null
}

function buildKnockoutEvidence(
	tree: ScreeningKnockoutTree | null | undefined,
	failedNodeIds: string[],
): { evidence: string; requirementLabel: string } | null {
	const requirementLabel = resolveFailedKnockoutRequirementLabel(tree, failedNodeIds)
	if (!requirementLabel) return null
	return {
		requirementLabel,
		evidence: buildKnockoutRejectionEvidence(requirementLabel),
	}
}

function buildRejectionUpdate(now: Date, evidence: string | null) {
	const reason = findRejectionReason(KNOCKOUT_REJECTION_REASON_CODE)
	return {
		candidateStatus: 'Rejected',
		candidate_status: 'Rejected',
		dateSelect: now,
		date_select: now,
		rejectionReasonCode: reason?.code ?? KNOCKOUT_REJECTION_REASON_CODE,
		rejectionReasonLabel: reason?.label ?? 'Não atende aos requisitos',
		rejectionDecisionSource: 'knockout' as const,
		rejectionDecidedByUserId: null,
		rejectionTaxonomyVersion: REJECTION_REASON_TAXONOMY_VERSION,
		rejectionEvidence: evidence,
		updated_at: now.toISOString(),
	}
}

export function createScreeningKnockoutService(infra: InfraProvider) {
	return {
		evaluate: evaluateScreeningKnockout,

		async submit(params: {
			companyId: string
			jobId: string
			jobAppliedId: string
			candidateUserId: string
			answers: ScreeningKnockoutAnswers
		}): Promise<SubmitScreeningKnockoutResult> {
			const { companyId, jobId, jobAppliedId, candidateUserId, answers } = params
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!jobId) throw new BadRequestError('jobId is required')
			if (!jobAppliedId) throw new BadRequestError('jobAppliedId is required')
			if (!candidateUserId) throw new BadRequestError('candidateUserId is required')

			const [job, jobApplied] = await Promise.all([
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
				infra.candidateRepository.getJobApplied(candidateUserId, jobAppliedId) as Promise<JobApplied | null>,
			])
			if (!job) throw new NotFoundError('Job not found')
			if (!jobApplied) throw new NotFoundError('Application not found')

			const appliedJobId = refId(jobApplied.jobApplied)
			const appliedCompanyId = jobApplied.companyOwner?.id ?? null
			if (appliedJobId && appliedJobId !== jobId) {
				throw new BadRequestError('Application does not belong to this job')
			}
			if (appliedCompanyId && appliedCompanyId !== companyId) {
				throw new BadRequestError('Application does not belong to this company')
			}

			const evaluation = evaluateScreeningKnockout(job.knockoutTree, answers)
			if (!hasNodes(job.knockoutTree)) {
				return {
					...evaluation,
					action: 'continue_interview',
					jobAppliedId,
					jobId,
					companyId,
					rejectionEvidence: null,
					failedRequirementLabel: null,
				}
			}

			const now = new Date()
			const resultPayload = {
				treeVersion: job.knockoutTree.version,
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
					...evaluation,
					action: 'continue_interview',
					jobAppliedId,
					jobId,
					companyId,
					rejectionEvidence: null,
					failedRequirementLabel: null,
				}
			}

			const knockoutEvidence = buildKnockoutEvidence(job.knockoutTree, evaluation.failedNodeIds)
			const rejectionEvidence = knockoutEvidence?.evidence ?? null
			const failedRequirementLabel = knockoutEvidence?.requirementLabel ?? null
			const rejectionUpdate = {
				...baseUpdate,
				...buildRejectionUpdate(now, rejectionEvidence),
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
				const reason = findRejectionReason(KNOCKOUT_REJECTION_REASON_CODE)
				await createOutboxWriter(infra).write({
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
				console.error('[ScreeningKnockout] failed to write screening_knockout event:', error)
			}

			return {
				...evaluation,
				action: 'rejected',
				jobAppliedId,
				jobId,
				companyId,
				rejectionEvidence,
				failedRequirementLabel,
			}
		},

		async getCandidateMirror(params: {
			companyId: string
			jobId: string
			jobAppliedId: string
			candidateUserId: string
		}): Promise<{
			rejected: boolean
			rejectionEvidence: string | null
			failedRequirementLabel: string | null
			rejectionDecisionSource: 'manual' | 'bulk' | 'knockout' | null
		}> {
			const { companyId, jobId, jobAppliedId, candidateUserId } = params
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!jobId) throw new BadRequestError('jobId is required')
			if (!jobAppliedId) throw new BadRequestError('jobAppliedId is required')
			if (!candidateUserId) throw new BadRequestError('candidateUserId is required')

			const jobApplied = await infra.candidateRepository.getJobApplied(
				candidateUserId,
				jobAppliedId,
			) as JobApplied | null
			if (!jobApplied) throw new NotFoundError('Application not found')

			const appliedJobId = refId(jobApplied.jobApplied)
			const appliedCompanyId = jobApplied.companyOwner?.id ?? null
			if (appliedJobId && appliedJobId !== jobId) {
				throw new BadRequestError('Application does not belong to this job')
			}
			if (appliedCompanyId && appliedCompanyId !== companyId) {
				throw new BadRequestError('Application does not belong to this company')
			}

			const mirror = resolveCandidateFacingRejectionExplanation(jobApplied)
			const rejected = typeof jobApplied.candidateStatus === 'string'
				&& jobApplied.candidateStatus.trim().toLowerCase() === 'rejected'

			const source = jobApplied.rejectionDecisionSource
			const rejectionDecisionSource =
				source === 'manual' || source === 'bulk' || source === 'knockout'
					? source
					: null

			return {
				rejected,
				rejectionEvidence: mirror.explanation,
				failedRequirementLabel: mirror.failedRequirementLabel,
				rejectionDecisionSource,
			}
		},
	}
}

export type ScreeningKnockoutService = ReturnType<typeof createScreeningKnockoutService>
