import { createPasswordService } from '../password-service'
import { createMockInfra } from './mock-infra'

jest.mock('@/env', () => ({
	env: { ATS_APP_URL: 'https://ats-hml.web.app' },
}))

function montar() {
	const infra = createMockInfra()
	const emailClient = { sendEmail: jest.fn().mockResolvedValue({}) }
	const service = createPasswordService(infra, emailClient)
	return { infra, emailClient, service }
}

describe('requestReset', () => {
	/**
	 * A regra que não pode cair: esta rota é PÚBLICA e responde sobre a conta de
	 * terceiros. Se "enviado" e "não existe" tivessem respostas diferentes, ela
	 * viraria um verificador de quem tem conta na Coploy.
	 */
	it('responde enviado mesmo quando a conta não existe — e não manda e-mail', async () => {
		const { infra, emailClient, service } = montar()
		infra.auth.getUserByEmail.mockResolvedValue(null)

		const resultado = await service.requestReset({ email: 'ninguem@teste.com' })

		expect(resultado).toEqual({ status: 'sent' })
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
	})

	it('responde enviado mesmo quando o envio falha', async () => {
		const { infra, emailClient, service } = montar()
		infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u1', displayName: 'Ana' })
		infra.auth.generatePasswordResetLink.mockResolvedValue('https://x/?oobCode=abc')
		emailClient.sendEmail.mockRejectedValue(new Error('postmark fora do ar'))

		await expect(service.requestReset({ email: 'ana@teste.com' })).resolves.toEqual({
			status: 'sent',
		})
	})

	/**
	 * O defeito que este teste tranca: eu mandava o link do Firebase CRU. Ele
	 * aponta para o action handler do projeto — em produção,
	 * `interview.coploy.io/reset-password` — com o destino só pendurado como
	 * `continueUrl`. Um e-mail de homolog saiu levando para produção.
	 *
	 * O teste antigo passava porque só checava se `oobCode=abc` aparecia no
	 * corpo, e aparecia: estava no link errado.
	 */
	it('monta o endereço do ATS com o oobCode, ignorando o handler do Firebase', async () => {
		const { infra, emailClient, service } = montar()
		infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u1', displayName: 'Ana' })
		infra.auth.generatePasswordResetLink.mockResolvedValue(
			'https://interview.coploy.io/reset-password?apiKey=AIza123&mode=resetPassword&oobCode=abc123&lang=pt-BR',
		)

		await service.requestReset({ email: 'Ana@Teste.com ' })

		// e-mail normalizado antes de qualquer lookup
		expect(infra.auth.getUserByEmail).toHaveBeenCalledWith('ana@teste.com')

		const enviado = emailClient.sendEmail.mock.calls[0][0]
		expect(enviado.to).toBe('ana@teste.com')
		expect(enviado.tag).toBe('password-reset')
		expect(enviado.textBody).toContain(
			'https://ats-hml.web.app/redefinir-senha?oobCode=abc123',
		)
		// o handler do Firebase não pode sobrar em lugar nenhum do e-mail
		expect(enviado.htmlBody).not.toContain('interview.coploy.io')
		expect(enviado.htmlBody).not.toContain('apiKey')
	})

	it('não manda e-mail quando o link vem sem oobCode', async () => {
		const { infra, emailClient, service } = montar()
		infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u1' })
		infra.auth.generatePasswordResetLink.mockResolvedValue('https://interview.coploy.io/x?y=1')

		await expect(service.requestReset({ email: 'ana@teste.com' })).resolves.toEqual({
			status: 'sent',
		})
		// link cru levaria o teste de homolog a trocar a senha de PRODUÇÃO
		expect(emailClient.sendEmail).not.toHaveBeenCalled()
	})
})

describe('changePassword', () => {
	const base = {
		userId: 'u1',
		email: 'ana@teste.com',
		currentPassword: 'SenhaAtual1',
		newPassword: 'SenhaNova1',
	}

	/**
	 * Sem exigir a senha atual, um notebook destravado ou um token roubado viram
	 * sequestro de conta: quem trocasse a senha passaria a ser o dono.
	 */
	it('recusa quando a senha atual está errada e não toca na conta', async () => {
		const { infra, service } = montar()
		infra.auth.signInWithPassword.mockRejectedValue(new Error('INVALID_PASSWORD'))

		await expect(service.changePassword(base)).rejects.toThrow('Senha atual incorreta.')
		expect(infra.auth.updateUser).not.toHaveBeenCalled()
	})

	it('troca a senha depois de conferir a atual', async () => {
		const { infra, service } = montar()
		infra.auth.signInWithPassword.mockResolvedValue('token')
		infra.auth.updateUser.mockResolvedValue({ uid: 'u1' })

		await expect(service.changePassword(base)).resolves.toEqual({ status: 'changed' })
		expect(infra.auth.updateUser).toHaveBeenCalledWith('u1', { password: 'SenhaNova1' })
	})

	it('recusa senha fraca ANTES de conferir a atual', async () => {
		const { infra, service } = montar()

		await expect(
			service.changePassword({ ...base, newPassword: 'curta1' }),
		).rejects.toThrow('pelo menos 8 caracteres')
		// nem chega a validar credencial: falhar cedo evita rodada inútil
		expect(infra.auth.signInWithPassword).not.toHaveBeenCalled()
	})

	it('exige maiúscula, minúscula e número', async () => {
		const { service } = montar()
		await expect(
			service.changePassword({ ...base, newPassword: 'senhaminuscula1' }),
		).rejects.toThrow('maiúsculas e minúsculas')
		await expect(
			service.changePassword({ ...base, newPassword: 'SenhaSemNumero' }),
		).rejects.toThrow('pelo menos um número')
	})

	it('recusa repetir a senha atual', async () => {
		const { infra, service } = montar()
		await expect(
			service.changePassword({ ...base, newPassword: base.currentPassword }),
		).rejects.toThrow('diferente da atual')
		expect(infra.auth.updateUser).not.toHaveBeenCalled()
	})
})
