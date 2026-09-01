import { deriveAuthenticityConfidence } from '../cheat-confidence'

describe('deriveAuthenticityConfidence', () => {
	it('Mariana case: pontuacao=0.72, exemplificacao media=5.8 → Revisar manualmente', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.72,
				nivel_confianca: 'Provavelmente autêntico',
				parecer_principal: 'ok',
				fatores_criticos: [],
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 5.5 } } },
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 6.1 } } },
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 5.8 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect(result).not.toBe(cheat)
		expect((result as any).resumo_executivo.nivel_confianca).toBe('Revisar manualmente')
		expect((result as any).resumo_executivo.pontuacao_autenticidade).toBe(0.72)
	})

	it('pontuacao fora da zona cinza (0.4) → retorna nivel_confianca original', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.4,
				nivel_confianca: 'Suspeito',
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 3.0 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect(result).toBe(cheat)
		expect((result as any).resumo_executivo.nivel_confianca).toBe('Suspeito')
	})

	it('exemplificacao media alta (7.5) → retorna nivel_confianca original', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.7,
				nivel_confianca: 'Provavelmente autêntico',
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 7.0 } } },
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 8.0 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect(result).toBe(cheat)
	})

	it('cheat null → retorna null', () => {
		expect(deriveAuthenticityConfidence(null, [])).toBeNull()
		expect(deriveAuthenticityConfidence(undefined, [])).toBeNull()
	})

	it('info vazio → retorna cheat original (sem aplicar regra)', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.7,
				nivel_confianca: 'Provavelmente autêntico',
			},
		}
		expect(deriveAuthenticityConfidence(cheat, [])).toBe(cheat)
		expect(deriveAuthenticityConfidence(cheat, null)).toBe(cheat)
	})

	it('info com perguntas sem exemplificacao → retorna cheat original', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.65,
				nivel_confianca: 'Provavelmente autêntico',
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: {} } },
			{ score_detalhado: {} },
			{},
		]
		expect(deriveAuthenticityConfidence(cheat, info)).toBe(cheat)
	})

	it('nao muta o objeto original', () => {
		const resumo = {
			pontuacao_autenticidade: 0.7,
			nivel_confianca: 'Provavelmente autêntico',
		}
		const cheat = { resumo_executivo: resumo }
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 4.0 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect(cheat.resumo_executivo.nivel_confianca).toBe('Provavelmente autêntico')
		expect((result as any).resumo_executivo.nivel_confianca).toBe('Revisar manualmente')
		expect(result).not.toBe(cheat)
	})

	it('pontuacao exatamente 0.6 (limite inferior) com media baixa → aplica regra', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.6,
				nivel_confianca: 'Provavelmente autêntico',
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 5.0 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect((result as any).resumo_executivo.nivel_confianca).toBe('Revisar manualmente')
	})

	it('pontuacao exatamente 0.8 (limite superior) com media baixa → aplica regra', () => {
		const cheat = {
			resumo_executivo: {
				pontuacao_autenticidade: 0.8,
				nivel_confianca: 'Provavelmente autêntico',
			},
		}
		const info = [
			{ score_detalhado: { qualidade_resposta: { exemplificacao: 5.9 } } },
		]
		const result = deriveAuthenticityConfidence(cheat, info)
		expect((result as any).resumo_executivo.nivel_confianca).toBe('Revisar manualmente')
	})
})
