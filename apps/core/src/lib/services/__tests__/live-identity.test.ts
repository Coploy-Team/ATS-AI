import { createInterviewsService } from '../interviews-service'
import { createMockInfra } from './mock-infra'

/**
 * Identidade viva sobre o espelho.
 *
 * O caso real que originou estes testes: o MESMO `user_ref` aparecia como
 * "Henrique HML / CEO" no Hunting e "Henrique Cabral / Desenvolvedor Full
 * Stack" na tela de Candidatos — dois retratos de épocas diferentes, porque
 * ambos os espelhos congelam nome, cargo e foto no momento da entrevista.
 */
describe('identidade viva nas listagens', () => {
	function setup(user: Record<string, unknown> | null) {
		const infra = createMockInfra()
		infra.companyRepository.getCompany = jest
			.fn()
			.mockResolvedValue({ id: 'c1', subscriptionPlan: 'enterprise' })
		infra.candidateRepository.listCompanyInterviews = jest.fn().mockResolvedValue([
			{
				id: 'ci-1',
				user_ref: 'u1',
				job_applied_ref: 'ja-1',
				name: 'Henrique HML',
				occupation: 'CEO',
				photo_url: '',
				candidateStatus: 'Approved',
				date: new Date('2026-01-01'),
				finished: true,
			},
		])
		infra.userRepository.getUser = jest.fn().mockResolvedValue(user)
		infra.candidateRepository.getJobApplied = jest.fn().mockResolvedValue(null)
		return { infra, service: createInterviewsService(infra) }
	}

	it('o doc do usuário manda em nome, cargo e foto', async () => {
		const { service } = setup({
			display_name: 'Henrique Cabral',
			occupation: 'Desenvolvedor Full Stack',
			photo_url: 'https://x/foto.png',
		})

		const { interviews } = await service.listInterviews({
			companyId: 'c1',
			page: 1,
			limit: 25,
			groupBy: 'candidate',
		} as never)

		expect(interviews[0]).toMatchObject({
			name: 'Henrique Cabral',
			occupation: 'Desenvolvedor Full Stack',
			photo_url: 'https://x/foto.png',
		})
	})

	it('campo ausente no usuário cai no espelho, não some', async () => {
		const { service } = setup({ display_name: 'Henrique Cabral' })

		const { interviews } = await service.listInterviews({
			companyId: 'c1',
			page: 1,
			limit: 25,
			groupBy: 'candidate',
		} as never)

		expect(interviews[0]).toMatchObject({ name: 'Henrique Cabral', occupation: 'CEO' })
	})

	it('falha ao ler o usuário preserva o espelho — nome velho é melhor que vazio', async () => {
		const { infra, service } = setup(null)
		infra.userRepository.getUser = jest.fn().mockRejectedValue(new Error('firestore down'))

		const { interviews } = await service.listInterviews({
			companyId: 'c1',
			page: 1,
			limit: 25,
			groupBy: 'candidate',
		} as never)

		expect(interviews[0]).toMatchObject({ name: 'Henrique HML', occupation: 'CEO' })
	})

	it('lê o usuário uma vez por pessoa, não por entrevista (cache do batch)', async () => {
		const { infra, service } = setup({ display_name: 'Henrique Cabral' })
		infra.candidateRepository.listCompanyInterviews = jest.fn().mockResolvedValue(
			Array.from({ length: 5 }, (_, index) => ({
				id: `ci-${index}`,
				user_ref: 'u1',
				job_applied_ref: `ja-${index}`,
				name: 'Henrique HML',
				candidateStatus: 'Approved',
				date: new Date('2026-01-01'),
				finished: true,
			})),
		)

		await service.listInterviews({
			companyId: 'c1',
			page: 1,
			limit: 25,
			groupBy: 'candidate',
		} as never)

		expect((infra.userRepository.getUser as jest.Mock).mock.calls.length).toBe(1)
	})
})
