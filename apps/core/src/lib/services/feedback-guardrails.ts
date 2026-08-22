import { BadRequestError } from '@coploy/shared/errors'

// Jurisdiction-sensitive legal guardrails for candidate-facing rejection feedback.
// Keep the lists centralized: legal review will evolve terms by locale/jurisdiction.

type FeedbackGuardrailEntry = {
	id: string
	language: 'pt-BR'
	terms: string[]
}

export type FeedbackGuardrailResult = {
	riskFlags: string[]
}

type FeedbackGuardrailField = 'candidateFeedback' | 'internalRejectionNote'

export const HARD_BLOCKED_FEEDBACK_TERMS: FeedbackGuardrailEntry[] = [
	{ id: 'gravidez', language: 'pt-BR', terms: ['gravidez', 'grávida', 'gestante'] },
	{ id: 'idade', language: 'pt-BR', terms: ['idade', 'anos de idade', 'muito velho', 'muito novo', 'jovem demais'] },
	{ id: 'saude', language: 'pt-BR', terms: ['doença', 'enfermidade', 'laudo médico', 'atestado'] },
	{ id: 'deficiencia', language: 'pt-BR', terms: ['deficiência', 'deficiente'] },
	{ id: 'raca', language: 'pt-BR', terms: ['raça', 'cor da pele'] },
	{ id: 'sexo', language: 'pt-BR', terms: ['sexo'] },
	{ id: 'genero', language: 'pt-BR', terms: ['identidade de gênero', 'genero do candidato', 'gênero do candidato'] },
	{ id: 'nacionalidade', language: 'pt-BR', terms: ['nacionalidade'] },
	{ id: 'estrangeiro', language: 'pt-BR', terms: ['estrangeiro', 'estrangeira'] },
	{ id: 'sindicato', language: 'pt-BR', terms: ['sindicato', 'sindicalizado', 'sindicalizada'] },
	{ id: 'religiao', language: 'pt-BR', terms: ['religião', 'crença'] },
	{ id: 'orientacao_sexual', language: 'pt-BR', terms: ['orientação sexual'] },
	{ id: 'familia_estado_civil', language: 'pt-BR', terms: ['estado civil', 'filhos'] },
	{ id: 'aparencia', language: 'pt-BR', terms: ['aparência', 'aparenta'] },
	{ id: 'sotaque', language: 'pt-BR', terms: ['sotaque'] },
]

export const AUDIT_FLAG_FEEDBACK_TERMS: FeedbackGuardrailEntry[] = [
	{ id: 'fit_cultural', language: 'pt-BR', terms: ['fit cultural', 'perfil cultural'] },
	{ id: 'distancia', language: 'pt-BR', terms: ['mora longe', 'distante'] },
	{ id: 'ansiedade', language: 'pt-BR', terms: ['ansioso'] },
	{ id: 'nervosismo', language: 'pt-BR', terms: ['nervoso'] },
	{ id: 'inseguranca', language: 'pt-BR', terms: ['inseguro'] },
	{ id: 'postura', language: 'pt-BR', terms: ['postura'] },
	{ id: 'nao_gostei', language: 'pt-BR', terms: ['não gostei'] },
]

function normalizeFeedbackText(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesWholeTerm(normalizedText: string, normalizedTerm: string): boolean {
	const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`, 'u')
	return pattern.test(normalizedText)
}

function findMatchedTerms(text: string, entries: FeedbackGuardrailEntry[]) {
	const normalizedText = normalizeFeedbackText(text)
	const matches: Array<{ id: string; term: string }> = []

	for (const entry of entries) {
		for (const term of entry.terms) {
			const normalizedTerm = normalizeFeedbackText(term)
			if (matchesWholeTerm(normalizedText, normalizedTerm)) {
				matches.push({ id: entry.id, term })
				break
			}
		}
	}

	return matches
}

export function mergeFeedbackRiskFlags(...flagGroups: Array<string[] | null | undefined>): string[] {
	return Array.from(new Set(flagGroups.flatMap((flags) => flags ?? [])))
}

export function validateRejectionTextOrThrow(
	message: string,
	field: FeedbackGuardrailField = 'candidateFeedback',
): FeedbackGuardrailResult {
	const blocked = findMatchedTerms(message, HARD_BLOCKED_FEEDBACK_TERMS)
	if (blocked.length > 0) {
		const term = blocked[0].term
		if (field === 'internalRejectionNote') {
			throw new BadRequestError(
				`A nota interna de reprovação contém o termo sensível "${term}". Não registre atributos protegidos em campos internos ou externos, pois isso gera risco jurídico mesmo sem envio ao candidato.`,
			)
		}

		throw new BadRequestError(
			`O feedback ao candidato contém o termo sensível "${term}". Reescreva ancorando em requisito objetivo da vaga, por exemplo: "A vaga exige X; a candidatura indicou Y".`,
		)
	}

	const riskFlags = findMatchedTerms(message, AUDIT_FLAG_FEEDBACK_TERMS).map((match) => match.id)
	return {
		riskFlags: riskFlags.length > 0 ? Array.from(new Set(riskFlags)) : [],
	}
}

export function validateCandidateFeedbackOrThrow(message: string): FeedbackGuardrailResult {
	return validateRejectionTextOrThrow(message, 'candidateFeedback')
}

export function validateInternalRejectionNoteOrThrow(message: string): FeedbackGuardrailResult {
	return validateRejectionTextOrThrow(message, 'internalRejectionNote')
}
