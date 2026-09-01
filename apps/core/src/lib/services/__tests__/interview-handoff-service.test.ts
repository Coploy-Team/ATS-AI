jest.mock('@/lib/init', () => ({
	firebaseAdminAuth: { createCustomToken: jest.fn().mockResolvedValue('custom-token-abc') },
}))

import { firebaseAdminAuth } from '@/lib/init'
import { createInterviewHandoffService } from '../interview-handoff-service'
import { createMockInfra } from './mock-infra'

function infraWithHandoff() {
	const infra = createMockInfra()
	// mock-infra não cobre o repositório novo — anexa só o necessário
	;(infra as unknown as { interviewHandoffRepository: unknown }).interviewHandoffRepository = {
		createHandoff: jest.fn().mockResolvedValue(undefined),
		consumeHandoff: jest.fn(),
	}
	return infra as ReturnType<typeof createMockInfra> & {
		interviewHandoffRepository: { createHandoff: jest.Mock; consumeHandoff: jest.Mock }
	}
}

describe('interview-handoff-service', () => {
	describe('issue', () => {
		it('emite código opaco de alta entropia com validade curta', async () => {
			const infra = infraWithHandoff()
			const service = createInterviewHandoffService(infra)

			const { code, expiresAt } = await service.issue('user-1')

			// 32 bytes em base64url ≈ 43 chars — não adivinhável
			expect(code.length).toBeGreaterThanOrEqual(40)
			expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
			const ttlSeconds = (expiresAt.getTime() - Date.now()) / 1000
			expect(ttlSeconds).toBeGreaterThan(0)
			expect(ttlSeconds).toBeLessThanOrEqual(300)
			expect(infra.interviewHandoffRepository.createHandoff).toHaveBeenCalledWith(code, 'user-1', expiresAt)
		})

		it('nunca repete código entre emissões', async () => {
			const infra = infraWithHandoff()
			const service = createInterviewHandoffService(infra)

			const codes = new Set<string>()
			for (let i = 0; i < 25; i++) codes.add((await service.issue('user-1')).code)

			expect(codes.size).toBe(25)
		})
	})

	describe('redeem', () => {
		it('troca código válido por token de sessão do dono', async () => {
			const infra = infraWithHandoff()
			infra.interviewHandoffRepository.consumeHandoff.mockResolvedValue({ id: 'c', userId: 'user-9' })
			const service = createInterviewHandoffService(infra)

			expect(await service.redeem('some-code')).toEqual({ sessionToken: 'custom-token-abc' })
			expect(firebaseAdminAuth.createCustomToken).toHaveBeenCalledWith('user-9')
		})

		it('recusa código já usado/expirado/inexistente sem emitir token', async () => {
			const infra = infraWithHandoff()
			infra.interviewHandoffRepository.consumeHandoff.mockResolvedValue(null)
			const service = createInterviewHandoffService(infra)

			await expect(service.redeem('burned-code')).rejects.toThrow(/invalid or expired/i)
			expect(firebaseAdminAuth.createCustomToken).not.toHaveBeenCalled()
		})

		it('não revela o motivo da falha (mesma mensagem pra inexistente e queimado)', async () => {
			const infra = infraWithHandoff()
			infra.interviewHandoffRepository.consumeHandoff.mockResolvedValue(null)
			const service = createInterviewHandoffService(infra)

			const first = await service.redeem('a').catch((e: Error) => e.message)
			const second = await service.redeem('b').catch((e: Error) => e.message)
			expect(first).toBe(second)
		})
	})
})
