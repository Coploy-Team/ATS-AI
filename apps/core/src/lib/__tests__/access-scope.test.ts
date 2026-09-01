import { capabilitiesOf, jobScopeOf, normalizeTenantRole } from '@coploy/domain'

/**
 * A escada de papéis (decisão do Henrique, 28/08).
 *
 * O que este teste protege não é a lista de verbos — é o INVARIANTE de
 * migração: a base legada não tem papel gravado, e quem não tem papel precisa
 * continuar enxergando a empresa inteira. Trocar o default aqui tranca cliente
 * fora do próprio dado no dia do deploy.
 */
describe('papéis e alcance', () => {
	it('só o recrutador tem alcance restrito', () => {
		expect(jobScopeOf('recruiter')).toBe('own')
		expect(jobScopeOf('admin')).toBe('all')
		expect(jobScopeOf('owner')).toBe('all')
		expect(jobScopeOf('editor')).toBe('all')
		expect(jobScopeOf('shared')).toBe('all')
	})

	it('conta sem papel continua vendo tudo — a base legada é a maioria', () => {
		const papel = normalizeTenantRole(undefined)
		expect(papel).toBe('owner')
		expect(jobScopeOf(papel)).toBe('all')
	})

	it('administrador gerencia acessos, mas não a fatura', () => {
		const admin = capabilitiesOf('admin')
		expect(admin).toContain('team:write')
		expect(admin).toContain('settings:write')
		expect(admin).not.toContain('billing:write')
	})

	it('recrutador opera a própria vaga inteira, sem mexer em time nem em configuração', () => {
		const recrutador = capabilitiesOf('recruiter')
		// o corte do papel é de ALCANCE, não de verbo: dentro da vaga dele,
		// faz o mesmo que o editor sempre fez
		expect(recrutador).toContain('job:write')
		expect(recrutador).toContain('candidate:move')
		expect(recrutador).toContain('candidate:reject')
		expect(recrutador).toContain('ai:use')
		expect(recrutador).not.toContain('team:write')
		expect(recrutador).not.toContain('settings:write')
		expect(recrutador).not.toContain('billing:write')
		/*
		 * Nem LEITURA de time e configuração (achado do teste do Henrique): a
		 * lista do Time é o mapa de quem é quem na empresa, e a configuração é a
		 * régua que ele não define. O pedido do cliente era privacidade entre
		 * analistas, não só entre vagas.
		 */
		expect(recrutador).not.toContain('team:read')
		expect(recrutador).not.toContain('settings:read')
	})

	it('editor legado segue existindo e enxergando tudo', () => {
		expect(normalizeTenantRole('editor')).toBe('editor')
		expect(jobScopeOf('editor')).toBe('all')
	})
})
