import { createAuthService } from '../auth-service'
import { createMockInfra } from './mock-infra'

describe('createAuthService', () => {
	const USER_ID = 'user-001'
	const PHONE = '+5511999999999'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createAuthService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createAuthService(infra)
	})

	it('findUserByPhone delegates to userRepository', async () => {
		const mockUser = { id: USER_ID, phone_number: PHONE }
		infra.userRepository.findUserByPhone.mockResolvedValue(mockUser as never)

		const result = await service.findUserByPhone(PHONE)

		expect(infra.userRepository.findUserByPhone).toHaveBeenCalledWith(PHONE)
		expect(result).toEqual(mockUser)
	})

	it('getUsersCompany delegates to userRepository', async () => {
		const mockMembership = { id: USER_ID, company: 'comp-1' }
		infra.userRepository.getUsersCompany.mockResolvedValue(mockMembership as never)

		const result = await service.getUsersCompany(USER_ID)

		expect(infra.userRepository.getUsersCompany).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual(mockMembership)
	})

	it('getUser delegates to userRepository', async () => {
		const mockUser = { id: USER_ID, email: 'test@example.com' }
		infra.userRepository.getUser.mockResolvedValue(mockUser as never)

		const result = await service.getUser(USER_ID)

		expect(infra.userRepository.getUser).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual(mockUser)
	})

	it('createUser delegates to userRepository', async () => {
		infra.userRepository.createUser.mockResolvedValue(undefined)
		await service.createUser({ email: 'a@b.com' }, USER_ID)
		expect(infra.userRepository.createUser).toHaveBeenCalledWith({ email: 'a@b.com' }, USER_ID)
	})

	it('updateUser delegates to userRepository', async () => {
		infra.userRepository.updateUser.mockResolvedValue(undefined)
		await service.updateUser(USER_ID, { displayName: 'João' })
		expect(infra.userRepository.updateUser).toHaveBeenCalledWith(USER_ID, { displayName: 'João' })
	})

	it('getCandidateProfile delegates to userRepository', async () => {
		infra.userRepository.getCandidateProfile.mockResolvedValue({ userId: USER_ID } as never)
		const result = await service.getCandidateProfile(USER_ID)
		expect(infra.userRepository.getCandidateProfile).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual({ userId: USER_ID })
	})

	it('getJobApplied delegates to candidateRepository', async () => {
		const mockJobApplied = { id: 'ja-1' }
		infra.candidateRepository.getJobApplied.mockResolvedValue(mockJobApplied as never)

		const result = await service.getJobApplied(USER_ID, 'ja-1')

		expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(USER_ID, 'ja-1')
		expect(result).toEqual(mockJobApplied)
	})

	it('verifyToken delegates to auth', async () => {
		const mockPayload = { uid: USER_ID }
		infra.auth.verifyToken = jest.fn().mockResolvedValue(mockPayload) as never

		const result = await service.verifyToken('tok-abc')

		expect(infra.auth.verifyToken).toHaveBeenCalledWith('tok-abc')
		expect(result).toEqual(mockPayload)
	})

	it('createUser_auth delegates to auth.createUser', async () => {
		const mockCreated = { uid: USER_ID, email: 'x@y.com' }
		infra.auth.createUser.mockResolvedValue(mockCreated as never)

		const result = await service.createUser_auth({
			email: 'x@y.com',
			password: 'secret',
			displayName: 'X',
		})

		expect(infra.auth.createUser).toHaveBeenCalledWith({
			email: 'x@y.com',
			password: 'secret',
			displayName: 'X',
		})
		expect(result).toEqual(mockCreated)
	})
})
