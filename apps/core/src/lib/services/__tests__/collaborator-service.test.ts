import { createCollaboratorService } from '../collaborator-service'
import { createMockInfra } from './mock-infra'

describe('createCollaboratorService', () => {
	const COMPANY_ID = 'company-abc'
	const USER_ID = 'user-001'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createCollaboratorService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createCollaboratorService(infra)
	})

	it('createCollaborator delegates to collaboratorRepository', async () => {
		const data = { name: 'Ana', role: 'admin' }
		infra.collaboratorRepository.createCollaborator.mockResolvedValue({ id: 'col-1', ...data } as never)

		const result = await service.createCollaborator(COMPANY_ID, data)

		expect(infra.collaboratorRepository.createCollaborator).toHaveBeenCalledWith(COMPANY_ID, data)
		expect(result).toMatchObject(data)
	})

	it('listCollaborators delegates to collaboratorRepository with options', async () => {
		infra.collaboratorRepository.listCollaborators.mockResolvedValue([] as never)
		const options = { orderByField: 'name', orderDirection: 'asc' as const }

		await service.listCollaborators(COMPANY_ID, options)

		expect(infra.collaboratorRepository.listCollaborators).toHaveBeenCalledWith(COMPANY_ID, options)
	})

	it('listCollaborators delegates without options', async () => {
		infra.collaboratorRepository.listCollaborators.mockResolvedValue([] as never)

		await service.listCollaborators(COMPANY_ID)

		expect(infra.collaboratorRepository.listCollaborators).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})

	it('createUser delegates to auth.createUser', async () => {
		const userData = { email: 'ana@empresa.com', password: 'senha123', displayName: 'Ana' }
		const mockCreated = { uid: USER_ID, email: userData.email }
		infra.auth.createUser.mockResolvedValue(mockCreated as never)

		const result = await service.createUser(userData)

		expect(infra.auth.createUser).toHaveBeenCalledWith(userData)
		expect(result).toEqual(mockCreated)
	})

	it('createUsersCompany delegates to userRepository', async () => {
		infra.userRepository.createUsersCompany.mockResolvedValue(undefined)
		const data = { company: COMPANY_ID, displayName: 'Ana' }

		await service.createUsersCompany(data, USER_ID)

		expect(infra.userRepository.createUsersCompany).toHaveBeenCalledWith(data, USER_ID)
	})

	/*
	 * O time nasce vazio quando a empresa é criada pelo cadastro: `is_owner`
	 * fica no documento do usuário e ninguém cria colaborador. Quem abriu a
	 * conta abria a tela de Time e lia "0 pessoas com acesso".
	 */
	describe('buildSelfCollaborator', () => {
		it('devolve o dono como owner quando ele não tem documento de colaborador', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue({
				id: USER_ID,
				email: 'dona@empresa.com',
				display_name: 'Dona da Empresa',
				is_owner: true,
				created_time: new Date('2026-08-01T00:00:00Z'),
			} as never)

			const eu = await service.buildSelfCollaborator(USER_ID, {
				accessLevel: 'all',
				status: 'all',
			})

			expect(eu).toMatchObject({
				id: USER_ID,
				accessLevel: 'owner',
				email: 'dona@empresa.com',
				name: 'Dona da Empresa',
				status: true,
				userRef: USER_ID,
			})
			expect(eu?.creationDate).toEqual(new Date('2026-08-01T00:00:00Z'))
		})

		it('quem não é dono entra como editor', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue({
				id: USER_ID,
				email: 'alguem@empresa.com',
				display_name: 'Alguém',
			} as never)

			const eu = await service.buildSelfCollaborator(USER_ID, {
				accessLevel: 'all',
				status: 'all',
			})

			expect(eu?.accessLevel).toBe('editor')
		})

		it('respeita o filtro de nível: dono não aparece numa busca por editor', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue({
				id: USER_ID,
				email: 'dona@empresa.com',
				is_owner: true,
			} as never)

			const eu = await service.buildSelfCollaborator(USER_ID, {
				accessLevel: 'editor',
				status: 'all',
			})

			expect(eu).toBeNull()
		})

		it('não aparece numa busca por inativos — a linha sintetizada é sempre ativa', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue({
				id: USER_ID,
				email: 'dona@empresa.com',
				is_owner: true,
			} as never)

			const eu = await service.buildSelfCollaborator(USER_ID, {
				accessLevel: 'all',
				status: 'inactive',
			})

			expect(eu).toBeNull()
		})

		it('sem usuário ou sem e-mail não inventa linha', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue(null as never)
			expect(
				await service.buildSelfCollaborator(USER_ID, { accessLevel: 'all', status: 'all' }),
			).toBeNull()

			infra.userRepository.getUsersCompany.mockResolvedValue({ id: USER_ID } as never)
			expect(
				await service.buildSelfCollaborator(USER_ID, { accessLevel: 'all', status: 'all' }),
			).toBeNull()
		})

		it('leitura falhando não derruba a tela', async () => {
			infra.userRepository.getUsersCompany.mockRejectedValue(new Error('firestore fora') as never)
			expect(
				await service.buildSelfCollaborator(USER_ID, { accessLevel: 'all', status: 'all' }),
			).toBeNull()
		})
	})
})
