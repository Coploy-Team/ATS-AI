import { createOpportunitiesService } from '../opportunities-service'
import { createMockInfra } from './mock-infra'

const NOW = Date.now()
const job = (overrides: Record<string, unknown>) => ({
	id: 'j',
	companyId: 'c1',
	jobName: 'Dev',
	public: true,
	stopped: false,
	archived: false,
	timeCreated: new Date(NOW),
	mainSkills: 'Node, React',
	carrerLevel: 'Pleno',
	workModality: 'Remoto',
	...overrides,
})

describe('opportunities-service (COP-11)', () => {
	function montar() {
		const infra = createMockInfra()
		infra.userRepository.getCandidateProfile.mockResolvedValue({
			id: 'u1',
			skills: ['Node'],
			level: 'Pleno',
			workModalities: ['remote'],
		} as never)
		infra.userRepository.getUser.mockResolvedValue({ uuid: 'u1', display_name: 'Ana' } as never)
		infra.companyRepository.getCompany.mockImplementation(async (id: string) => ({
			id,
			companyName: `Empresa ${id}`,
			companLogo: null,
			featureFlags: { applyLite: true },
		}) as never)
		infra.candidateRepository.listJobsApplied.mockResolvedValue([
			{ id: 'ja', jobApplied: { id: 'j-applied' } },
		] as never)
		return { infra, service: createOpportunitiesService(infra) }
	}

	it('lista só vaga pública e aberta, com compatibilidade e a marca de já candidatado', async () => {
		const { infra, service } = montar()
		infra.jobRepository.listPublicJobs.mockResolvedValue([
			job({ id: 'j-applied' }),
			job({ id: 'j-private', public: false }),
			job({ id: 'j-stopped', stopped: true }),
			job({ id: 'j-profile', profileInterview: true }),
			job({ id: 'j-closed', closingDate: new Date(NOW - 86_400_000) }),
			job({ id: 'j-exit', typeInterview: 'exitJob', jobName: 'Desligamento do Pedro' }),
			job({ id: 'j-emotional', typeInterview: 'emotional' }),
			job({ id: 'j-open', companyId: 'c2', mainSkills: 'Go' }),
		] as never)

		const { jobs, total } = await service.list('u1')

		expect(total).toBe(2)
		expect(jobs.map((j) => j.jobId)).toEqual(['j-applied', 'j-open'])
		expect(jobs[0].applied).toBe(true)
		expect(jobs[0].compatibility.score).toBeGreaterThan(jobs[1].compatibility.score ?? -1)
		expect(jobs[1].companyName).toBe('Empresa c2')
		// uma leitura por empresa distinta, não por vaga
		expect(infra.companyRepository.getCompany).toHaveBeenCalledTimes(2)
	})

	it('filtra por modalidade, texto e compatibilidade mínima — sem apagar quem não tem número', async () => {
		const { infra, service } = montar()
		infra.userRepository.getCandidateProfile.mockResolvedValue({ id: 'u1' } as never)
		infra.jobRepository.listPublicJobs.mockResolvedValue([
			job({ id: 'remoto', workModality: 'Remoto' }),
			job({ id: 'presencial', workModality: 'Presencial', jobName: 'Analista de Dados' }),
		] as never)

		expect((await service.list('u1', { workModality: 'onsite' })).jobs.map((j) => j.jobId)).toEqual(['presencial'])
		expect((await service.list('u1', { query: 'dados' })).jobs.map((j) => j.jobId)).toEqual(['presencial'])
		// qualificação: a vaga precisa PEDIR a skill — mesma leitura das tags, sem acento
		expect((await service.list('u1', { skill: 'react' })).jobs).toHaveLength(2)
		expect((await service.list('u1', { skill: 'kotlin' })).jobs).toHaveLength(0)
		// perfil sem skills/nível/modalidade: score null em todas — o corte por mínimo não some com elas
		const semNumero = await service.list('u1', { minCompatibility: 80 })
		expect(semNumero.jobs).toHaveLength(2)
		expect(semNumero.jobs[0].compatibility.score).toBeNull()
		expect(semNumero.jobs[0].compatibility.missingProfileData).toEqual(['skills', 'level', 'workModalities'])
	})

	it('detalhe: 404 vira null; vaga aberta vem com compatibilidade e candidatura', async () => {
		const { infra, service } = montar()
		infra.jobRepository.getJob.mockResolvedValue(job({ id: 'j-applied' }) as never)
		infra.jobRepository.getJobPortalByCompany.mockResolvedValue(null as never)

		const details = await service.get('u1', 'c1', 'j-applied')

		expect(details?.applied).toBe(true)
		expect(details?.compatibility.tags.some((t) => t.kind === 'skill' && t.label === 'Node' && t.matched)).toBe(true)
		expect(details?.companyName).toBe('Empresa c1')

		infra.jobRepository.getJob.mockResolvedValue(job({ id: 'x', public: false }) as never)
		expect(await service.get('u1', 'c1', 'x')).toBeNull()
	})

	it('o que estudar: skills pedidas pelas vagas que já pedem algo que a pessoa tem, por número de vagas', async () => {
		const { infra, service } = montar()
		infra.jobRepository.listPublicJobs.mockResolvedValue([
			job({ id: 'a', mainSkills: 'Node, Docker, AWS' }),
			job({ id: 'b', mainSkills: 'Node, Docker' }),
			// vaga de outra área: não pede nada que a pessoa tem — fica fora da conta
			job({ id: 'c', mainSkills: 'Cobol, JCL' }),
		] as never)

		const result = await service.studyGaps('u1')

		expect(result.jobsConsidered).toBe(2)
		expect(result.gaps).toEqual([
			{ skill: 'Docker', jobs: 2 },
			{ skill: 'AWS', jobs: 1 },
		])
		expect(result.reason).toBeNull()
	})

	it('sem skills no perfil não há lacuna a calcular — diz por quê', async () => {
		const { infra, service } = montar()
		infra.userRepository.getCandidateProfile.mockResolvedValue({ id: 'u1' } as never)
		infra.jobRepository.listPublicJobs.mockResolvedValue([job({ id: 'a' })] as never)

		expect(await service.studyGaps('u1')).toEqual({ jobsConsidered: 0, gaps: [], reason: 'no_profile_skills' })
	})

	describe('último match do perfil aberto (F4)', () => {
		it('pula vaga-espelho, avaliação e vaga sem skills até achar a mais recente que dá número', async () => {
			const { infra, service } = montar()
			infra.candidateRepository.listJobsApplied.mockResolvedValue([
				{ id: 'a1', companyOwner: { id: 'c1' }, jobApplied: { id: 'j-old' }, appliedTime: new Date('2026-06-10') },
				{ id: 'a2', companyOwner: { id: 'c1' }, jobApplied: { id: 'j-profile' }, appliedTime: new Date('2026-09-20') },
				{ id: 'a3', companyOwner: { id: 'c1' }, jobApplied: { id: 'j-eval' }, appliedTime: new Date('2026-09-18') },
				{ id: 'a4', companyOwner: { id: 'c1' }, jobApplied: { id: 'j-noskills' }, appliedTime: new Date('2026-09-15') },
				{ id: 'a5', companyOwner: { id: 'c1' }, jobApplied: { id: 'j-recent' }, appliedTime: new Date('2026-08-02') },
			] as never)
			const jobs: Record<string, unknown> = {
				'j-old': job({ id: 'j-old', mainSkills: 'Go' }),
				'j-profile': job({ id: 'j-profile', profileInterview: true }),
				'j-eval': job({ id: 'j-eval', typeInterview: 'evaluation' }),
				'j-noskills': job({ id: 'j-noskills', mainSkills: '' }),
				'j-recent': job({ id: 'j-recent' }),
			}
			infra.jobRepository.getJob.mockImplementation(async (_c: string, id: string) => jobs[id] as never)

			const match = await service.latestMatch('u1')

			// Node ✓ React ✗ · Pleno ✓ · Remoto ✓ → 0.3 + 0.25 + 0.15 = 70
			expect(match).toEqual({ score: 70, month: '2026-08' })
		})

		it('sem entrada nenhuma, ou sem nenhuma que dê número, não há match', async () => {
			const { infra, service } = montar()
			infra.candidateRepository.listJobsApplied.mockResolvedValue([] as never)
			expect(await service.latestMatch('u1')).toBeNull()

			infra.candidateRepository.listJobsApplied.mockResolvedValue([
				{ id: 'a1', companyOwner: { id: 'c1' }, jobApplied: { id: 'j' }, appliedTime: new Date() },
			] as never)
			infra.jobRepository.getJob.mockResolvedValue(job({ mainSkills: '' }) as never)
			expect(await service.latestMatch('u1')).toBeNull()
		})
	})
})
