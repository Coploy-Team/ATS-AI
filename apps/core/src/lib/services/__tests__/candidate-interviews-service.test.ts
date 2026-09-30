jest.mock('@/env', () => ({
	env: { INTERVIEW_BASE_URL: 'https://interview.test', PROFILE_INTERVIEW_COMPANY_ID: 'host-company' },
}))

import { createMockInfra } from './mock-infra'
import { createCandidateInterviewsService } from '../candidate-interviews-service'

function jobApplied(id: string, jobId: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		jobApplied: { id: jobId },
		companyOwner: { id: 'company-1' },
		appliedTime: new Date('2026-08-01T00:00:00Z'),
		finished: false,
		interview: { info: [] },
		...extra,
	}
}

function infraCom(applied: unknown[], jobs: Record<string, unknown> = {}) {
	const infra = createMockInfra()
	infra.candidateRepository.listJobsApplied.mockResolvedValue(applied)
	infra.userRepository.getUser.mockResolvedValue({ id: 'user-1' })
	infra.companyRepository.getCompany.mockResolvedValue({ id: 'company-1', companyName: 'Acme' })
	infra.jobRepository.getJob.mockImplementation(async (_c: string, jobId: string) => jobs[jobId] ?? null)
	return infra
}

describe('candidate-interviews-service', () => {
	describe('listMine', () => {
		/*
		 * O defeito que sumiu com a entrevista de perfil de um candidato real: sem
		 * `orderBy`, o Firestore devolve por ID de documento. Quem tinha 103
		 * entrevistas recebia 50 em ordem ALFABÉTICA e a de perfil (83ª por ID)
		 * ficava de fora. A ordenação em memória arrumava a exibição, nunca a
		 * amostra — por isso o teste olha a CHAMADA, não o resultado.
		 */
		it('pede a página ordenada por data, não a fatia alfabética por id', async () => {
			const infra = infraCom([])

			await createCandidateInterviewsService(infra).listMine('user-1')

			expect(infra.candidateRepository.listJobsApplied).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ orderByField: 'appliedTime', orderDirection: 'desc' }),
			)
		})

		it('separa a entrevista de perfil das entrevistas em empresas', async () => {
			const infra = infraCom(
				[jobApplied('ja-1', 'job-real'), jobApplied('ja-2', 'mirror-job')],
				{ 'job-real': { id: 'job-real', jobName: 'Dev' }, 'mirror-job': { id: 'mirror-job', profileInterview: true } },
			)

			const result = await createCandidateInterviewsService(infra).listMine('user-1')

			expect(result.profileInterview?.id).toBe('ja-2')
			expect(result.companyInterviews.map((i) => i.id)).toEqual(['ja-1'])
		})

		/*
		 * Mesmo ordenada, a página tem teto — e a entrevista de perfil pode ser
		 * antiga. Aí ela é buscada pelo documento, usando o id que o status
		 * descobre pela vaga-espelho.
		 */
		it('busca a entrevista de perfil que ficou fora da página', async () => {
			const infra = infraCom([jobApplied('ja-1', 'job-real')], { 'job-real': { id: 'job-real' } })
			infra.userRepository.getUser.mockResolvedValue({
				id: 'user-1',
				dreamJobsInterview: { jobId: 'mirror-job', status: 'pending' },
			})
			// o status encontra a entrevista pela vaga-espelho...
			infra.candidateRepository.listJobsApplied.mockImplementation(async (_u: string, opts: any) =>
				opts?.filters
					? [jobApplied('ja-antiga', 'mirror-job', { finished: true })]
					: [jobApplied('ja-1', 'job-real')],
			)
			// ...e a lista a abre pelo documento
			infra.candidateRepository.getJobApplied.mockResolvedValue(
				jobApplied('ja-antiga', 'mirror-job', { finished: true, finishedTime: new Date('2026-08-18T10:00:00Z') }),
			)

			const result = await createCandidateInterviewsService(infra).listMine('user-1')

			expect(result.profileInterview).toMatchObject({ id: 'ja-antiga', status: 'completed' })
			expect(result.companyInterviews.map((i) => i.id)).toEqual(['ja-1'])
		})

		it('nunca devolve nota — a avaliação é de quem pediu a entrevista', async () => {
			const infra = infraCom(
				[jobApplied('ja-1', 'job-real', { finished: true, interview: { info: [], score: 8.5 }, score_value: 8.5 })],
				{ 'job-real': { id: 'job-real' } },
			)

			const result = await createCandidateInterviewsService(infra).listMine('user-1')

			expect(JSON.stringify(result)).not.toContain('8.5')
		})
	})
})
