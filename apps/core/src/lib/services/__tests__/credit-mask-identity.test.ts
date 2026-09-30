import { createInterviewsService } from '../interviews-service'
import { createMockInfra } from './mock-infra'

jest.mock('@/env', () => ({ env: {} }))

/**
 * A máscara de crédito precisa sumir com o CONTEÚDO e preservar a IDENTIDADE.
 *
 * O objeto mascarado não tinha `id`, e o schema da rota `/companies/user/{id}`
 * exige — bastava uma entrevista não paga para a resposta inteira virar 400 e a
 * tela de Candidatos não abrir. Sem `id` e sem as referências, o cliente também
 * não conseguiria oferecer o desbloqueio daquela entrevista, que é o que a
 * máscara existe para vender.
 */
describe('máscara de crédito na tela de candidato', () => {
	function montar() {
		const infra = createMockInfra()
		infra.userRepository.getUser.mockResolvedValue({
			id: 'user-1',
			display_name: 'Ana',
			email: 'ana@teste.com',
		})
		infra.candidateRepository.listCompanyInterviews.mockResolvedValue([
			{
				id: 'interview-1',
				finished: true,
				score: '8.5',
				jobName: 'Dev',
				job_name: 'Dev',
				date: new Date('2026-01-10'),
				user_ref: { id: 'user-1' },
				job_applied_ref: { id: 'ja-1' },
				job_ref: { id: 'job-1' },
				company_id: 'company-1',
			},
		])
		infra.candidateRepository.listJobsApplied.mockResolvedValue([])
		infra.jobRepository.getJob.mockResolvedValue(null)
		infra.jobRepository.listJobs.mockResolvedValue([])
		// nenhum crédito gasto: tudo mascarado
		infra.billingRepository.listCreditsUsed.mockResolvedValue([])
		return createInterviewsService(infra)
	}

	it('mantém id e referências no item mascarado', async () => {
		const service = montar()
		const resultado = (await service.getCandidateDetails({
			userId: 'user-1',
			companyId: 'company-1',
			company: { id: 'company-1', subscriptionPlan: 'free' },
		})) as { candidate: { interviews: Array<Record<string, unknown>> } } | null

		const item = resultado?.candidate.interviews[0]
		expect(item).toBeDefined()
		// o schema da rota exige `id: z.string()` — sem isto a resposta dá 400
		expect(typeof item?.id).toBe('string')
		expect(item?.masked).toBe(true)
		// o que a máscara vende: sem a referência não dá para desbloquear
		expect(item?.job_applied_ref).toBeTruthy()
	})

	it('esconde a nota de quem não pagou', async () => {
		const service = montar()
		const resultado = (await service.getCandidateDetails({
			userId: 'user-1',
			companyId: 'company-1',
			company: { id: 'company-1', subscriptionPlan: 'free' },
		})) as { candidate: { interviews: Array<Record<string, unknown>> } } | null

		expect(resultado?.candidate.interviews[0]?.score).toBeNull()
	})
})
