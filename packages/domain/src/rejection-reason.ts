export interface RejectionReason {
	code: string
	label: string
	requiresNote?: boolean
	candidateVisibility: CandidateVisibility
	requiresEvidence?: boolean
}

export type CandidateVisibility = 'hidden' | 'generic' | 'specific'

export const REJECTION_REASON_TAXONOMY_VERSION = '2026-08-13'

export const REJECTION_REASONS: RejectionReason[] = [
	{
		code: 'nao_atende_requisitos',
		label: 'Não atende aos requisitos',
		candidateVisibility: 'specific',
		requiresEvidence: true,
	},
	{
		code: 'experiencia_insuficiente',
		label: 'Experiência insuficiente',
		candidateVisibility: 'specific',
		requiresEvidence: true,
	},
	{
		code: 'pretensao_salarial',
		label: 'Pretensão salarial desalinhada',
		candidateVisibility: 'specific',
		requiresEvidence: true,
	},
	{
		code: 'perfil_nao_aderente',
		label: 'Perfil não aderente',
		candidateVisibility: 'hidden',
	},
	{
		code: 'posicao_cancelada',
		label: 'Posição cancelada',
		candidateVisibility: 'specific',
	},
	{
		code: 'candidato_desistiu',
		label: 'Candidato desistiu',
		candidateVisibility: 'hidden',
	},
	{
		code: 'contratado_outro',
		label: 'Outro candidato contratado',
		candidateVisibility: 'generic',
	},
	{
		code: 'outro',
		label: 'Outro',
		requiresNote: true,
		candidateVisibility: 'hidden',
	},
]

export function findRejectionReason(code: string): RejectionReason | null {
	return REJECTION_REASONS.find((reason) => reason.code === code) ?? null
}

export function getCandidateVisibility(code: string | null | undefined): CandidateVisibility {
	if (!code) return 'hidden'
	return findRejectionReason(code)?.candidateVisibility ?? 'hidden'
}
