import type { JobApplied, ScreeningKnockoutTree } from '@coploy/domain'

import {
	buildKnockoutRejectionEvidence,
	resolveCandidateFacingRejectionExplanation,
	resolveFailedKnockoutRequirementLabel,
} from '../candidate-rejection-mirror'

const tree: ScreeningKnockoutTree = {
	version: 1,
	nodes: [
		{
			id: 'age',
			question: 'Tem 18 anos ou mais?',
			type: 'boolean',
			rule: { operator: 'equals', value: true },
			onFail: 'knockout',
		},
		{
			id: 'location',
			question: 'Localidade',
			type: 'single-choice',
			rule: { operator: 'in', value: ['SP'] },
			onFail: 'flag',
		},
	],
}

describe('candidate-rejection-mirror', () => {
	it('builds the canonical knockout evidence string', () => {
		expect(buildKnockoutRejectionEvidence('Tem 18 anos ou mais?')).toBe(
			'Requisito "Tem 18 anos ou mais?" não atendido.',
		)
	})

	it('resolves the failed knockout requirement label without exposing node ids', () => {
		expect(resolveFailedKnockoutRequirementLabel(tree, ['age', 'location'])).toBe(
			'Tem 18 anos ou mais?',
		)
	})

	it('exposes specific knockout evidence to the candidate', () => {
		const application = {
			candidateStatus: 'Rejected',
			rejectionReasonCode: 'nao_atende_requisitos',
			rejectionReasonLabel: 'Não atende aos requisitos',
			rejectionEvidence: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			rejectionDecisionSource: 'knockout',
			screeningKnockoutResult: {
				treeVersion: 1,
				passed: false,
				score: 50,
				failedNodeIds: ['age'],
				rejectionReasonCode: 'nao_atende_requisitos',
				evaluatedAt: new Date(),
			},
			screeningKnockoutTreeSnapshot: tree,
		} as Pick<
			JobApplied,
			| 'candidateStatus'
			| 'rejectionReasonCode'
			| 'rejectionReasonLabel'
			| 'rejectionEvidence'
			| 'rejectionDecisionSource'
			| 'screeningKnockoutResult'
			| 'screeningKnockoutTreeSnapshot'
		>

		expect(resolveCandidateFacingRejectionExplanation(application)).toEqual({
			explanation: 'Requisito "Tem 18 anos ou mais?" não atendido.',
			failedRequirementLabel: 'Tem 18 anos ou mais?',
		})
	})

	it('hides reasons marked as hidden from the candidate', () => {
		expect(resolveCandidateFacingRejectionExplanation({
			candidateStatus: 'Rejected',
			rejectionReasonCode: 'perfil_nao_aderente',
			rejectionReasonLabel: 'Perfil não aderente',
			rejectionEvidence: null,
			rejectionDecisionSource: 'manual',
			screeningKnockoutResult: null,
			screeningKnockoutTreeSnapshot: null,
		})).toEqual({
			explanation: null,
			failedRequirementLabel: null,
		})
	})
})
