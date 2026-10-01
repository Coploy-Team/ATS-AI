jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined, // sem exchange — mint retorna custom token direto
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
	},
}))

import { createCandidateAuthService } from '../candidate-auth-service'
import { createMockInfra } from './mock-infra'

describe('candidate-auth-service', () => {
	describe('loginWithPassword', () => {
		it('retorna uid quando credenciais válidas', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({ uid: 'user-1', email: 'a@b.com' })
			const service = createCandidateAuthService(infra)

			expect(await service.loginWithPassword('a@b.com', 'secret1')).toBe('user-1')
		})

		/*
		 * O defeito que originou esta guarda: o Firebase Auth é compartilhado entre
		 * quem usa a Coploy como EMPRESA e quem a usa como candidato. Um recrutador
		 * entrava pelo assistente, o login passava, e ele virava candidato fantasma
		 * — currículo gravado em `candidateProfiles`, nada em `users/{uid}`, e o
		 * assistente dizendo (com razão) que o perfil estava completo enquanto
		 * nenhuma tela o mostrava.
		 */
		it('cria o documento de candidato quando a conta existe no Auth mas não como candidato', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({
				uid: 'recrutador-1',
				email: 'diego@empresa.com',
				displayName: 'Diego',
			})
			infra.userRepository.getUser.mockResolvedValue(null)
			const service = createCandidateAuthService(infra)

			expect(await service.loginWithPassword('diego@empresa.com', 'secret1')).toBe(
				'recrutador-1',
			)
			expect(infra.userRepository.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					uuid: 'recrutador-1',
					email: 'diego@empresa.com',
					display_name: 'Diego',
				}),
				'recrutador-1',
			)
		})

		/*
		 * É esta semeadura que faz a base existente se curar no próximo login, em
		 * vez de exigir uma escrita em produção na mão. Sem ela o documento
		 * nasceria em branco e o hunting só voltaria a enxergar a pessoa quando ela
		 * editasse o perfil de novo.
		 */
		it('semeia o documento com o currículo que a pessoa já tinha', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({
				uid: 'diego',
				email: 'diego@empresa.com',
				displayName: 'Diego Paraizo',
			})
			infra.userRepository.getUser.mockResolvedValue(null)
			infra.userRepository.getCandidateProfile.mockResolvedValue({
				occupation: 'Fundador e CTO',
				level: 'Executivo',
				countryOfResidence: 'BR',
			})
			const service = createCandidateAuthService(infra)

			await service.loginWithPassword('diego@empresa.com', 'secret1')
			expect(infra.userRepository.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					occupation: 'Fundador e CTO',
					level: 'Executivo',
					countryOfResidence: 'BR',
					display_name: 'Diego Paraizo',
				}),
				'diego',
			)
		})

		/*
		 * `users.phone_number ?? perfil.phone`: string vazia não é nulo, então o
		 * `phone_number: ''` do molde apagaria da tela um telefone que continua no
		 * banco. O teste trava isso.
		 */
		it('não apaga o telefone que já estava no currículo', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u4', email: 'x@b.com' })
			infra.userRepository.getUser.mockResolvedValue(null)
			infra.userRepository.getCandidateProfile.mockResolvedValue({
				phone: '+55 11 94211-5617',
			})
			const service = createCandidateAuthService(infra)

			await service.loginWithPassword('x@b.com', 'secret1')
			const [doc] = (infra.userRepository.createUser as jest.Mock).mock.calls[0]
			expect(doc.phone_number).toBe('+55 11 94211-5617')
		})

		/* Sem currículo, o documento nasce no padrão — nunca com `undefined`. */
		it('sem currículo, não inventa campo', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u3', email: 'novo@b.com' })
			infra.userRepository.getUser.mockResolvedValue(null)
			infra.userRepository.getCandidateProfile.mockResolvedValue(null)
			const service = createCandidateAuthService(infra)

			await service.loginWithPassword('novo@b.com', 'secret1')
			const [doc] = (infra.userRepository.createUser as jest.Mock).mock.calls[0]
			expect(doc.occupation).toBe('')
			expect(Object.values(doc)).not.toContain(undefined)
		})

		it('não recria o documento de quem já é candidato', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({ uid: 'user-1', email: 'a@b.com' })
			infra.userRepository.getUser.mockResolvedValue({ uuid: 'user-1' })
			const service = createCandidateAuthService(infra)

			await service.loginWithPassword('a@b.com', 'secret1')
			expect(infra.userRepository.createUser).not.toHaveBeenCalled()
		})

		/* Sem `displayName` no Auth, o nome sai do e-mail — nunca vazio. */
		it('cai para o e-mail quando a conta do Auth não tem nome', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockResolvedValue('id-token')
			infra.auth.getUserByEmail.mockResolvedValue({ uid: 'u2', email: 'semnome@b.com' })
			infra.userRepository.getUser.mockResolvedValue(null)
			const service = createCandidateAuthService(infra)

			await service.loginWithPassword('semnome@b.com', 'secret1')
			expect(infra.userRepository.createUser).toHaveBeenCalledWith(
				expect.objectContaining({ display_name: 'semnome' }),
				'u2',
			)
		})

		it('retorna null quando senha inválida (não vaza o erro)', async () => {
			const infra = createMockInfra()
			infra.auth.signInWithPassword.mockRejectedValue(new Error('INVALID_PASSWORD'))
			const service = createCandidateAuthService(infra)

			expect(await service.loginWithPassword('a@b.com', 'errada')).toBeNull()
			expect(infra.auth.getUserByEmail).not.toHaveBeenCalled()
		})
	})

	describe('registerCandidate', () => {
		it('GCP: cria Auth user + doc Firestore no padrão do core (uuid, dicebear, language)', async () => {
			const infra = createMockInfra()
			infra.auth.createUserAndGetToken = undefined as never
			infra.auth.createUser.mockResolvedValue({ uid: 'new-uid', email: 'novo@coploy.io' })
			const service = createCandidateAuthService(infra)

			const uid = await service.registerCandidate({
				name: 'Nova Candidata',
				email: 'novo@coploy.io',
				password: 'secret1',
				language: 'en',
			})

			expect(uid).toBe('new-uid')
			expect(infra.auth.createUser).toHaveBeenCalledWith({
				email: 'novo@coploy.io',
				password: 'secret1',
				displayName: 'Nova Candidata',
			})
			expect(infra.userRepository.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					uuid: 'new-uid',
					display_name: 'Nova Candidata',
					email: 'novo@coploy.io',
					language: 'en',
					photo_url: expect.stringContaining('dicebear'),
				}),
				'new-uid',
			)
		})

		it('selfhosted: usa createUserAndGetToken quando disponível', async () => {
			const infra = createMockInfra()
			infra.auth.createUserAndGetToken = jest.fn().mockResolvedValue({ uid: 'ba-uid', token: 't' }) as never
			const service = createCandidateAuthService(infra)

			const uid = await service.registerCandidate({
				name: 'X',
				email: 'x@y.com',
				password: 'secret1',
			})

			expect(uid).toBe('ba-uid')
			expect(infra.auth.createUser).not.toHaveBeenCalled()
			expect(infra.userRepository.createUser).toHaveBeenCalledWith(
				expect.objectContaining({ uuid: 'ba-uid', language: 'pt-BR' }),
				'ba-uid',
			)
		})
	})

	describe('mintUserIdToken', () => {
		it('sem FIREBASE_API_KEY retorna o custom token direto (selfhosted)', async () => {
			const infra = createMockInfra()
			infra.auth.createCustomToken.mockResolvedValue('custom-token-xyz')
			const service = createCandidateAuthService(infra)

			expect(await service.mintUserIdToken('user-1')).toBe('custom-token-xyz')
		})
	})

	describe('getUserLanguage', () => {
		it('retorna language do doc do usuário; null quando ausente', async () => {
			const infra = createMockInfra()
			infra.userRepository.getUser.mockResolvedValueOnce({ id: 'u1', language: 'en' } as never)
			const service = createCandidateAuthService(infra)
			expect(await service.getUserLanguage('u1')).toBe('en')

			infra.userRepository.getUser.mockResolvedValueOnce(null as never)
			expect(await service.getUserLanguage('u2')).toBeNull()
		})
	})
})
