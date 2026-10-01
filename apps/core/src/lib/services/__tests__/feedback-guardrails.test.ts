import { BadRequestError } from '@coploy/shared/errors'
import {
	validateCandidateFeedbackOrThrow,
	validateInternalRejectionNoteOrThrow,
} from '../feedback-guardrails'

describe('feedback guardrails', () => {
	it('blocks hard terms with accents and uppercase', () => {
		expect(() =>
			validateCandidateFeedbackOrThrow('A candidata está GRÁVIDA e por isso não seguiremos.'),
		).toThrow(BadRequestError)
	})

	it('blocks protected terms added for legal guardrails', () => {
		for (const message of [
			'A candidatura não seguirá por sexo informado no cadastro.',
			'A candidatura não seguirá por identidade de gênero.',
			'A candidatura não seguirá por nacionalidade.',
			'A candidatura não seguirá por ser estrangeira.',
			'A candidatura não seguirá por vínculo com sindicato.',
		]) {
			expect(() => validateCandidateFeedbackOrThrow(message)).toThrow(BadRequestError)
		}
	})

	it('uses an internal-note message when blocking protected terms in rejectionNote', () => {
		expect(() =>
			validateInternalRejectionNoteOrThrow('A candidata está grávida e não poderia assumir agora.'),
		).toThrow('nota interna de reprovação contém o termo sensível "grávida"')
	})

	it('allows legitimate feedback anchored in job requirements without flags', () => {
		const result = validateCandidateFeedbackOrThrow(
			'A vaga exige CNH categoria B ativa; a candidatura indicou CNH categoria A.',
		)

		expect(result.riskFlags).toEqual([])
	})

	it('does not flag energia when it is the business domain', () => {
		const result = validateCandidateFeedbackOrThrow(
			'A vaga exige experiência no setor de energia eólica; a candidatura indicou atuação em varejo.',
		)

		expect(result.riskFlags).toEqual([])
	})

	it('does not match short terms inside larger words', () => {
		const result = validateCandidateFeedbackOrThrow(
			'A candidatura indicou capacidade analitica abaixo do requisito da vaga.',
		)

		expect(result.riskFlags).toEqual([])
	})

	it('does not block genre when it is a media job requirement', () => {
		const result = validateCandidateFeedbackOrThrow(
			'A vaga exige experiência com curadoria de gênero musical sertanejo; a candidatura indicou apenas jornalismo esportivo.',
		)

		expect(result.riskFlags).toEqual([])
	})
})
