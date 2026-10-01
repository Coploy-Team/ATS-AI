import type { JobApplied, ScreeningKnockoutTree } from '@coploy/domain'
import { findRejectionReason, getCandidateVisibility } from '@coploy/domain'

function isRejected(status: string | null | undefined): boolean {
	return typeof status === 'string' && status.trim().toLowerCase() === 'rejected'
}

function hasNodes(tree: ScreeningKnockoutTree | null | undefined): tree is ScreeningKnockoutTree {
	return Boolean(tree && Array.isArray(tree.nodes) && tree.nodes.length > 0)
}

/**
 * Label do requisito knockout que derrubou a candidatura — só o texto da pergunta,
 * sem IDs de nó nem score. Usado pelo espelho candidate-facing pra montar copy i18n.
 */
export function resolveFailedKnockoutRequirementLabel(
	tree: ScreeningKnockoutTree | null | undefined,
	failedNodeIds: string[] | null | undefined,
): string | null {
	if (!hasNodes(tree) || !failedNodeIds?.length) return null
	const failedKnockoutNode = tree.nodes.find(
		(node) => node.onFail === 'knockout' && failedNodeIds.includes(node.id),
	)
	const label = failedKnockoutNode?.question?.trim()
	return label || null
}

/**
 * Explicação humana canônica gravada na candidatura (e no outbox).
 * Mantém o mesmo template em todos os writers — não recalcular por outro caminho.
 */
export function buildKnockoutRejectionEvidence(requirementLabel: string): string {
	return `Requisito "${requirementLabel}" não atendido.`
}

/**
 * Espelho seguro pro candidato: aplica a política de visibilidade (TOS-027a).
 * Nunca devolve score, IDs de nó, snapshot da árvore ou nota interna.
 */
export function resolveCandidateFacingRejectionExplanation(
	application: Pick<
		JobApplied,
		| 'candidateStatus'
		| 'rejectionReasonCode'
		| 'rejectionReasonLabel'
		| 'rejectionEvidence'
		| 'rejectionDecisionSource'
		| 'screeningKnockoutResult'
		| 'screeningKnockoutTreeSnapshot'
	>,
): {
	explanation: string | null
	failedRequirementLabel: string | null
} {
	if (!isRejected(application.candidateStatus)) {
		return { explanation: null, failedRequirementLabel: null }
	}

	const visibility = getCandidateVisibility(application.rejectionReasonCode)
	if (visibility === 'hidden') {
		return { explanation: null, failedRequirementLabel: null }
	}

	const failedRequirementLabel =
		application.rejectionDecisionSource === 'knockout'
			? resolveFailedKnockoutRequirementLabel(
					application.screeningKnockoutTreeSnapshot,
					application.screeningKnockoutResult?.failedNodeIds,
				)
			: null

	if (visibility === 'generic') {
		const explanation =
			application.rejectionReasonLabel
			?? (application.rejectionReasonCode
				? findRejectionReason(application.rejectionReasonCode)?.label ?? null
				: null)
		return { explanation, failedRequirementLabel: null }
	}

	const explanation =
		application.rejectionEvidence
		?? (failedRequirementLabel
			? buildKnockoutRejectionEvidence(failedRequirementLabel)
			: null)
		?? application.rejectionReasonLabel
		?? (application.rejectionReasonCode
			? findRejectionReason(application.rejectionReasonCode)?.label ?? null
			: null)

	return { explanation, failedRequirementLabel }
}
