import { createOtsExportService } from '../ots-export-service'
import { createMockInfra } from './mock-infra'

describe('ots-export-service (V2-702)', () => {
	it('exporta os campos da spec com proveniência', async () => {
		const infra = createMockInfra()
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue({
			headline: 'Tech Lead',
			skills: ['Node', 'React'],
			experiences: [{ title: 'Dev', company: 'Coploy' }],
			fieldSources: { headline: { source: 'chat' } },
			missingFields: ['summary'],
			completeness: 72,
		})
		infra.userRepository.getUser = jest.fn().mockResolvedValue({ display_name: 'Ana' })

		const result = await createOtsExportService(infra).exportProfile('u1')

		expect(result.otsVersion).toBe('0.1')
		expect(result.profile).toMatchObject({
			id: 'u1',
			name: 'Ana',
			headline: 'Tech Lead',
			skills: ['Node', 'React'],
			completeness: 72,
		})
		expect(result.profile.fieldSources).toEqual({ headline: { source: 'chat' } })
		expect(result.profile.experiences).toHaveLength(1)
	})

	it('atributo protegido NÃO sai, mesmo estando no perfil (OTS §2.4.4)', async () => {
		const infra = createMockInfra()
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue({
			headline: 'Dev',
			cpf: '000.000.000-00',
			birthDate: '1990-01-01',
			gender: 'F',
			race: 'parda',
		})
		infra.userRepository.getUser = jest.fn().mockResolvedValue({})

		const result = await createOtsExportService(infra).exportProfile('u1')

		expect(result.profile).not.toHaveProperty('cpf')
		expect(result.profile).not.toHaveProperty('birthDate')
		expect(result.profile).not.toHaveProperty('gender')
		expect(result.profile).not.toHaveProperty('race')
	})

	it('perfil vazio exporta a estrutura, não um erro', async () => {
		const infra = createMockInfra()
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue(null)
		infra.userRepository.getUser = jest.fn().mockResolvedValue(null)

		const result = await createOtsExportService(infra).exportProfile('u1')

		expect(result.profile.id).toBe('u1')
		expect(result.profile.experiences).toEqual([])
		expect(result.profile.missingFields).toEqual([])
		expect(result.profile.headline).toBeNull()
	})

	it('identidade preenche nome/foto quando o currículo não tem', async () => {
		const infra = createMockInfra()
		infra.userRepository.getCandidateProfile = jest.fn().mockResolvedValue({ headline: 'Dev' })
		infra.userRepository.getUser = jest
			.fn()
			.mockResolvedValue({ display_name: 'Bruno', photo_url: 'https://x/y.png' })

		const result = await createOtsExportService(infra).exportProfile('u1')

		expect(result.profile.name).toBe('Bruno')
		expect(result.profile.photoUrl).toBe('https://x/y.png')
	})
})
