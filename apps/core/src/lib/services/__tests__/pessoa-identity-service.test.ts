import { BadRequestError } from '@coploy/shared/errors'
import type { Pessoa } from '@coploy/domain'
import { createPessoaService } from '../pessoa-identity-service'
import { createMockInfra } from './mock-infra'

const BASE_PESSOA: Pessoa = {
	id: '52998224725',
	cpfNormalized: '52998224725',
	displayName: 'Ana Silva',
	roles: [],
	linkedUserIds: [],
	linkedUsersCompanyIds: [],
	linkedCandidateProfileIds: [],
	mergedIntoPessoaId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
}

describe('createPessoaService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createPessoaService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createPessoaService(infra)
	})

	it('creates pessoa by normalized valid CPF and links user', async () => {
		infra.pessoaRepository.findByCpf.mockResolvedValue(null)
		infra.pessoaRepository.create.mockResolvedValue(BASE_PESSOA)
		infra.pessoaRepository.linkUser.mockResolvedValue({
			...BASE_PESSOA,
			linkedUserIds: ['user-1'],
		})

		const result = await service.upsertByCpf({
			cpf: '529.982.247-25',
			userId: 'user-1',
			displayName: 'Ana Silva',
		})

		expect(result.needsMerge).toBe(false)
		expect(result.pessoa.linkedUserIds).toEqual(['user-1'])
		expect(infra.pessoaRepository.findByCpf).toHaveBeenCalledWith('52998224725')
		expect(infra.pessoaRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: '52998224725',
				cpfNormalized: '52998224725',
			}),
		)
	})

	it('is idempotent when CPF and user are already linked', async () => {
		const existing = { ...BASE_PESSOA, linkedUserIds: ['user-1'] }
		infra.pessoaRepository.findByCpf.mockResolvedValue(existing)

		const result = await service.upsertByCpf({
			cpf: '52998224725',
			userId: 'user-1',
		})

		expect(result).toEqual({ pessoa: existing, needsMerge: false })
		expect(infra.pessoaRepository.create).not.toHaveBeenCalled()
		expect(infra.pessoaRepository.linkUser).not.toHaveBeenCalled()
	})

	it('returns needsMerge when CPF is already linked to another user', async () => {
		const existing = { ...BASE_PESSOA, linkedUserIds: ['user-1'] }
		infra.pessoaRepository.findByCpf.mockResolvedValue(existing)

		const result = await service.upsertByCpf({
			cpf: '52998224725',
			userId: 'user-2',
		})

		expect(result).toEqual({
			pessoa: existing,
			needsMerge: true,
			reason: 'user_conflict',
		})
		expect(infra.pessoaRepository.linkUser).not.toHaveBeenCalled()
	})

	it('links usersCompany and candidateProfile without overwriting existing links', async () => {
		infra.pessoaRepository.findByCpf.mockResolvedValue(BASE_PESSOA)
		infra.pessoaRepository.linkUsersCompany.mockResolvedValue({
			...BASE_PESSOA,
			linkedUsersCompanyIds: ['uc-1'],
		})
		infra.pessoaRepository.linkCandidateProfile.mockResolvedValue({
			...BASE_PESSOA,
			linkedUsersCompanyIds: ['uc-1'],
			linkedCandidateProfileIds: ['cp-1'],
		})

		const result = await service.upsertByCpf({
			cpf: '52998224725',
			usersCompanyId: 'uc-1',
			candidateProfileId: 'cp-1',
		})

		expect(result.needsMerge).toBe(false)
		expect(result.pessoa.linkedUsersCompanyIds).toEqual(['uc-1'])
		expect(result.pessoa.linkedCandidateProfileIds).toEqual(['cp-1'])
	})

	it('rejects invalid CPF without logging the raw value', async () => {
		await expect(
			service.upsertByCpf({
				cpf: '111.111.111-11',
				userId: 'user-1',
			}),
		).rejects.toBeInstanceOf(BadRequestError)

		await expect(
			service.upsertByCpf({
				cpf: '111.111.111-11',
				userId: 'user-1',
			}),
		).rejects.toMatchObject({ message: 'CPF inválido' })
		expect(infra.pessoaRepository.findByCpf).not.toHaveBeenCalled()
	})

	describe('getCpfByUserId', () => {
		it('returns normalized CPF when user is linked to a pessoa', async () => {
			infra.pessoaRepository.findByTarget.mockResolvedValue({
				...BASE_PESSOA,
				linkedUserIds: ['user-1'],
			})

			await expect(service.getCpfByUserId('user-1')).resolves.toBe('52998224725')
			expect(infra.pessoaRepository.findByTarget).toHaveBeenCalledWith('user', 'user-1')
		})

		it('returns null when there is no pessoa link', async () => {
			infra.pessoaRepository.findByTarget.mockResolvedValue(null)

			await expect(service.getCpfByUserId('user-orphan')).resolves.toBeNull()
			expect(infra.pessoaRepository.findByTarget).toHaveBeenCalledWith('user', 'user-orphan')
		})

		it('returns null when repository fails so /auth/me keeps serving the profile', async () => {
			infra.pessoaRepository.findByTarget.mockRejectedValue(new Error('firestore unavailable'))

			await expect(service.getCpfByUserId('user-1')).resolves.toBeNull()
		})
	})
})
