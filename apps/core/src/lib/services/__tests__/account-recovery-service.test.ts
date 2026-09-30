import { createAccountRecoveryService } from '../account-recovery-service'
import { createMockInfra } from './mock-infra'

/** CPF sintaticamente válido (dígitos verificadores corretos). */
const CPF = '52998224725'

function setup(pessoa: Record<string, unknown> | null) {
	const infra = createMockInfra()
	infra.pessoaRepository.findByCpf = jest.fn().mockResolvedValue(pessoa)
	infra.interviewHandoffRepository.createHandoff = jest.fn().mockResolvedValue(undefined)
	return { infra, service: createAccountRecoveryService(infra) }
}

describe('account-recovery-service (V2-703)', () => {
	it('responde igual para CPF que existe e CPF que não existe', async () => {
		const known = setup({ id: 'p1', linkedUserIds: ['u1'] })
		const unknown = setup(null)

		const a = await known.service.requestRecovery({ cpf: CPF, channel: 'email', contact: 'a@b.c' })
		const b = await unknown.service.requestRecovery({ cpf: CPF, channel: 'email', contact: 'a@b.c' })

		// a rota não pode virar oráculo de "este CPF tem conta aqui"
		expect(a).toEqual(b)
	})

	it('emite ticket só quando existe conta — e nunca o devolve na resposta', async () => {
		const { infra, service } = setup({ id: 'p1', linkedUserIds: ['u1'] })

		const result = await service.requestRecovery({ cpf: CPF, channel: 'email', contact: 'a@b.c' })

		expect(infra.interviewHandoffRepository.createHandoff).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(result)).not.toContain(
			(infra.interviewHandoffRepository.createHandoff as jest.Mock).mock.calls[0][0],
		)
	})

	it('falha ao emitir o ticket não muda a resposta', async () => {
		const { infra, service } = setup({ id: 'p1', linkedUserIds: ['u1'] })
		infra.interviewHandoffRepository.createHandoff = jest.fn().mockRejectedValue(new Error('down'))

		await expect(
			service.requestRecovery({ cpf: CPF, channel: 'email', contact: 'a@b.c' }),
		).resolves.toMatchObject({ ok: true })
	})

	it('CPF inválido é recusado antes de qualquer leitura', async () => {
		const { infra, service } = setup({ id: 'p1', linkedUserIds: ['u1'] })

		await expect(
			service.requestRecovery({ cpf: '11111111111', channel: 'email', contact: 'a@b.c' }),
		).rejects.toThrow()
		expect(infra.pessoaRepository.findByCpf).not.toHaveBeenCalled()
	})

	it('detecta identidade fragmentada — e NÃO funde', async () => {
		const { infra, service } = setup({ id: 'p1', linkedUserIds: ['u1', 'u2'] })

		const merge = service.detectMerge({ id: 'p1', linkedUserIds: ['u1', 'u2'] } as never)

		expect(merge).toMatchObject({ pessoaId: 'p1', reason: 'multiple_users' })
		// nenhum vínculo é reescrito: quem decide é humano
		expect(infra.pessoaRepository.linkUser).not.toHaveBeenCalled()
	})

	it('conta única não vira candidato a merge', () => {
		const { service } = setup(null)
		expect(service.detectMerge({ id: 'p1', linkedUserIds: ['u1'] } as never)).toBeNull()
	})
})
