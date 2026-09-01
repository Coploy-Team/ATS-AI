import {
	createCandidateProfileService,
	computeCompleteness,
	missingFields,
} from '../candidate-profile-service'
import { createMockInfra } from './mock-infra'

function infraWithProfile(stored: Record<string, unknown> | null, user: Record<string, unknown> | null = null) {
	const infra = createMockInfra()
	infra.userRepository.getCandidateProfile.mockResolvedValue(stored)
	infra.userRepository.getUser.mockResolvedValue(user)
	infra.userRepository.createCandidateProfile.mockResolvedValue({ id: 'u1' })
	infra.userRepository.updateCandidateProfile.mockResolvedValue(undefined)
	infra.userRepository.updateUser.mockResolvedValue(undefined)
	return infra
}

describe('candidate-profile-service', () => {
	describe('getProfile', () => {
		it('usa users/{uid} como fonte da identidade e o perfil pro currículo', async () => {
			const infra = infraWithProfile(
				{ id: 'u1', occupation: 'Dev', skills: ['Node'] },
				{ id: 'u1', display_name: 'Ana', email: 'a@b.c', photo_url: 'http://p' },
			)
			const service = createCandidateProfileService(infra)

			const profile = await service.getProfile('u1')

			expect(profile).toMatchObject({
				name: 'Ana',
				email: 'a@b.c',
				photoUrl: 'http://p',
				occupation: 'Dev',
				skills: ['Node'],
			})
		})

		it('faz fallback pros campos que só existem no doc do usuário (candidato legado)', async () => {
			const infra = infraWithProfile(null, {
				id: 'u1',
				occupation: 'Analista',
				level: 'Pleno',
				professionalObjectives: 'crescer em dados',
				countryOfResidence: 'BR',
				resumeUrl: 'http://cv',
			})
			const service = createCandidateProfileService(infra)

			const profile = await service.getProfile('u1')

			expect(profile).toMatchObject({
				occupation: 'Analista',
				level: 'Pleno',
				professionalObjectives: 'crescer em dados',
				countryOfResidence: 'BR',
				resumeUrl: 'http://cv',
			})
		})

		it('lê o nome legado `profession` como occupation', async () => {
			const infra = infraWithProfile({ id: 'u1', profession: 'Full Stack' })
			const service = createCandidateProfileService(infra)

			expect((await service.getProfile('u1')).occupation).toBe('Full Stack')
		})
	})

	describe('updateProfile', () => {
		it('faz merge parcial: fonte nova não apaga o que outra preencheu', async () => {
			const infra = infraWithProfile({
				id: 'u1',
				occupation: 'Dev',
				summary: 'resumo escrito no chat',
				skills: ['Node'],
			})
			const service = createCandidateProfileService(infra)

			// LinkedIn traz experiências, sem tocar em resumo/skills
			const result = await service.updateProfile(
				'u1',
				{ experiences: [{ title: 'Dev', company: 'Acme' }] },
				'linkedin',
			)

			expect(result.summary).toBe('resumo escrito no chat')
			expect(result.skills).toEqual(['Node'])
			expect(result.experiences).toHaveLength(1)
		})

		it('registra a origem de cada campo alterado', async () => {
			const infra = infraWithProfile({ id: 'u1', fieldSources: { summary: 'chat' } })
			const service = createCandidateProfileService(infra)

			const result = await service.updateProfile('u1', { skills: ['Go'] }, 'resume')

			expect(result.fieldSources).toMatchObject({ summary: 'chat', skills: 'resume' })
		})

		it('espelha em users/{uid} SÓ os campos que o hunting consome', async () => {
			const infra = infraWithProfile({ id: 'u1' })
			const service = createCandidateProfileService(infra)

			await service.updateProfile(
				'u1',
				{
					occupation: 'Dev',
					countryOfResidence: 'BR',
					countriesOfInterest: ['BR', 'PT'],
					summary: 'não deve ir pro espelho',
					skills: ['Node'],
				},
				'chat',
			)

			expect(infra.userRepository.updateUser).toHaveBeenCalledWith('u1', {
				occupation: 'Dev',
				countryOfResidence: 'BR',
				countriesOfInterest: ['BR', 'PT'],
			})
		})

		it('cria o perfil quando ainda não existe (primeira escrita de qualquer fonte)', async () => {
			const infra = infraWithProfile(null)
			const service = createCandidateProfileService(infra)

			await service.updateProfile('u1', { occupation: 'Dev' }, 'chat')

			expect(infra.userRepository.createCandidateProfile).toHaveBeenCalled()
			expect(infra.userRepository.updateCandidateProfile).not.toHaveBeenCalled()
		})

		it('não perde o currículo se o espelho falhar (espelho é derivado)', async () => {
			const infra = infraWithProfile({ id: 'u1' })
			infra.userRepository.updateUser.mockRejectedValue(new Error('firestore down'))
			const service = createCandidateProfileService(infra)

			const result = await service.updateProfile('u1', { occupation: 'Dev' }, 'chat')

			expect(result.occupation).toBe('Dev')
			// currículo persistido; só o espelho (derivado) falhou
			expect(infra.userRepository.updateCandidateProfile).toHaveBeenCalled()
		})

		it('normaliza `profession` (legado) para `occupation`', async () => {
			const infra = infraWithProfile({ id: 'u1' })
			const service = createCandidateProfileService(infra)

			const result = await service.updateProfile('u1', { profession: 'Designer' }, 'chat')

			expect(result.occupation).toBe('Designer')
			expect(result.profession).toBeUndefined()
		})

		it('com CPF no patch: chama upsert da camada pessoa e NÃO devolve CPF na resposta', async () => {
			const infra = infraWithProfile({ id: 'u1', name: 'Ana' })
			infra.pessoaRepository.findByCpf.mockResolvedValue(null)
			infra.pessoaRepository.create.mockResolvedValue({
				id: '52998224725',
				cpfNormalized: '52998224725',
				linkedUserIds: [],
				linkedUsersCompanyIds: [],
				linkedCandidateProfileIds: [],
			})
			infra.pessoaRepository.linkUser.mockResolvedValue({
				id: '52998224725',
				cpfNormalized: '52998224725',
				linkedUserIds: ['u1'],
				linkedUsersCompanyIds: [],
				linkedCandidateProfileIds: [],
			})
			infra.pessoaRepository.linkCandidateProfile.mockResolvedValue({
				id: '52998224725',
				cpfNormalized: '52998224725',
				linkedUserIds: ['u1'],
				linkedUsersCompanyIds: [],
				linkedCandidateProfileIds: ['u1'],
			})
			const service = createCandidateProfileService(infra)

			const result = await service.updateProfile(
				'u1',
				{ cpf: '529.982.247-25', occupation: 'Dev' },
				'chat',
			)

			expect(infra.pessoaRepository.findByCpf).toHaveBeenCalledWith('52998224725')
			expect(infra.pessoaRepository.create).toHaveBeenCalled()
			expect(infra.pessoaRepository.linkUser).toHaveBeenCalledWith('52998224725', 'u1')
			expect(infra.pessoaRepository.linkCandidateProfile).toHaveBeenCalledWith(
				'52998224725',
				'u1',
			)
			expect(result.occupation).toBe('Dev')
			expect(result).not.toHaveProperty('cpf')
			// CPF persistido no storage (não na resposta)
			expect(infra.userRepository.updateCandidateProfile).toHaveBeenCalledWith(
				'u1',
				expect.objectContaining({ cpf: '529.982.247-25' }),
			)
		})

		it('sem CPF no patch: no-op silencioso na camada pessoa', async () => {
			const infra = infraWithProfile({ id: 'u1' })
			const service = createCandidateProfileService(infra)

			await service.updateProfile('u1', { occupation: 'Dev' }, 'chat')

			expect(infra.pessoaRepository.findByCpf).not.toHaveBeenCalled()
			expect(infra.pessoaRepository.create).not.toHaveBeenCalled()
		})

		it('upsert de pessoa falhando não impede salvar o perfil', async () => {
			const infra = infraWithProfile({ id: 'u1' })
			infra.pessoaRepository.findByCpf.mockRejectedValue(new Error('firestore down'))
			const service = createCandidateProfileService(infra)

			const result = await service.updateProfile(
				'u1',
				{ cpf: '529.982.247-25', occupation: 'Dev' },
				'chat',
			)

			expect(result.occupation).toBe('Dev')
			expect(infra.userRepository.updateCandidateProfile).toHaveBeenCalled()
			expect(result).not.toHaveProperty('cpf')
		})
	})

	describe('completude', () => {
		it('cresce conforme o currículo é preenchido e chega a 100', () => {
			expect(computeCompleteness({})).toBe(0)
			expect(computeCompleteness({ occupation: 'Dev' })).toBe(12)
			expect(
				computeCompleteness({
					name: 'Ana',
					occupation: 'Dev',
					level: 'Pleno',
					location: 'SP',
					headline: 'Full Stack',
					summary: 'resumo',
					skills: ['Node'],
					experiences: [{ title: 'Dev' }],
					education: [{ institution: 'USP' }],
					languages: [{ language: 'pt' }],
					professionalObjectives: 'objetivos',
					resumeUrl: 'http://cv',
				}),
			).toBe(100)
		})

		it('ignora vazios: string em branco e lista vazia não contam', () => {
			expect(computeCompleteness({ occupation: '   ', skills: [] })).toBe(0)
		})

		it('lista o que falta priorizando o que mais pesa', () => {
			const missing = missingFields({ name: 'Ana' })
			expect(missing[0]).toBe('experiences')
			expect(missing).not.toContain('name')
		})
	})
})
