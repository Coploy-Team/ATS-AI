import { REJECTION_REASONS, getCandidateVisibility } from '@coploy/domain'

describe('rejection reason taxonomy', () => {
	it('does not expose perfil_nao_aderente as a specific candidate-facing reason', () => {
		const reason = REJECTION_REASONS.find((item) => item.code === 'perfil_nao_aderente')

		expect(reason?.candidateVisibility).toBe('hidden')
		expect(reason?.candidateVisibility).not.toBe('specific')
	})

	it('fails closed for unknown candidate visibility codes', () => {
		expect(getCandidateVisibility('codigo_legado_desconhecido')).toBe('hidden')
		expect(getCandidateVisibility(null)).toBe('hidden')
	})
})
