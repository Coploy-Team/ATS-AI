import { createCandidateDossierService } from '../candidate-dossier-service'
import { createMockInfra } from './mock-infra'

describe('createCandidateDossierService', () => {
	const COMPANY_ID = 'comp-1'
	const JOB_ID = 'job-1'
	const CANDIDATE_ID = 'cand-1'

	let infra: ReturnType<typeof createMockInfra>

	const DAY = 86_400_000

	function interviewDoc(overrides: Record<string, unknown> = {}) {
		return {
			id: CANDIDATE_ID,
			name: 'Mariana Corrêa Vidal',
			email: 'mariana@example.com',
			score: 8.6,
			finished: true,
			candidateStatus: 'Selected',
			date: new Date(Date.now() - 24 * DAY).toISOString(),
			dateSelect: new Date(Date.now() - 3 * DAY).toISOString(),
			user_ref: { path: 'users/user-1' },
			job_applied_ref: { path: 'users/user-1/jobsApplied/ja-1' },
			...overrides,
		}
	}

	beforeEach(() => {
		infra = createMockInfra()
		/*
		 * Enterprise por default nos testes de conteúdo: o bloqueio SaaS (V2-704)
		 * é exercitado no bloco próprio, no fim do arquivo. Sem isto, todo teste
		 * de mapeamento passaria a receber o dossiê mascarado.
		 */
		infra.companyRepository.getCompany.mockResolvedValue({
			id: COMPANY_ID,
			subscriptionPlan: 'enterprise',
		} as never)
		infra.candidateRepository.getJobInterview.mockResolvedValue(interviewDoc() as never)
		infra.jobRepository.getJob.mockResolvedValue({
			id: JOB_ID,
			jobName: 'Engenheira de Software Sênior',
			feedbackSlaHours: 48,
		} as never)
		infra.candidateRepository.getJobApplied.mockResolvedValue({
			id: 'ja-1',
			interview: {
				score: 8.6,
				info: [
					{ id: 'q1', question: 'Fale sobre arquitetura', score: 9, skills: 'Node.js, Kafka' },
					{ id: 'q2', question: 'Conflito com produto', score: 8, pulou_a_pergunta: true },
				],
			},
			avaliacaoFinal: {
				resumo: 'Sênior de verdade.',
				generalRecomendation: 'avançar para entrevista final',
				competencias_criticas: [
					{ nome: 'Profundidade técnica', pontuacao: 9.2, pontos_fortes: ['quantifica impacto'] },
					// dado antigo grava 0–1 — a normalização é o que evita mostrar "0,8"
					{ nome: 'Comunicação', pontuacao: 0.84, pontos_fortes: [] },
				],
				competencias_adicionais: [{ nome: 'Liderança', pontuacao: 7.6 }],
				recomendacoes: {
					pontos_fortes: ['quantifica impacto sem ser pedida'],
					areas_desenvolvimento: ['gestão direta limitada'],
					sugestoes_melhoria: ['validar na entrevista final'],
				},
			},
		} as never)
		/*
		 * Nome DIFERENTE do espelho de propósito: é o que prova a precedência.
		 * O espelho tem "Mariana Corrêa Vidal" (retrato da entrevista) e o doc
		 * vivo tem "Mariana Vidal" — quem manda é o doc.
		 */
		infra.userRepository.getUser.mockResolvedValue({ display_name: 'Mariana Vidal' } as never)
		infra.userRepository.getCandidateProfile.mockResolvedValue({
			occupation: 'Engenheira de Software',
			yearsOfExperience: 8,
			skills: ['Node.js', 'Terraform'],
		} as never)
		infra.candidateRepository.listJobInterviews.mockResolvedValue([
			{ score: 8.6, date: new Date(Date.now() - 24 * DAY).toISOString() },
			{ score: 6.0, date: new Date(Date.now() - 31 * DAY).toISOString() },
			{ score: 5.0, date: new Date(Date.now() - 40 * DAY).toISOString() },
		] as never)
	})

	const service = () => createCandidateDossierService(infra)

	it('monta o dossiê com entrevista, competências e perguntas', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		// doc vivo > espelho: o espelho traz "Mariana Corrêa Vidal", de outra época
		expect(dossier.candidate.name).toBe('Mariana Vidal')
		expect(dossier.interview?.score).toBe(8.6)
		expect(dossier.interview?.questionCount).toBe(2)
		expect(dossier.interview?.recommendation).toBe('avançar para entrevista final')
		expect(dossier.interview?.competencies).toHaveLength(3)
	})

	// O bug que isto trava: escala 0–1 aparecia como "0,8" na tela.
	it('normaliza competência gravada em escala 0–1', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		const comunicacao = dossier.interview?.competencies.find((c) => c.name === 'Comunicação')
		expect(comunicacao?.score).toBe(8.4)
	})

	it('marca competência crítica separada da adicional', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.interview?.competencies.find((c) => c.name === 'Liderança')?.critical).toBe(
			false,
		)
		expect(
			dossier.interview?.competencies.find((c) => c.name === 'Profundidade técnica')?.critical,
		).toBe(true)
	})

	it('preserva "pergunta pulada" para a nota 0 não passar por desempenho', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.interview?.questions[1].skipped).toBe(true)
	})

	// A nota sozinha não decide nada — é o que o protótipo mostra ao lado dela.
	it('compara a nota com os demais candidatos da vaga', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.benchmark.jobAverage).toBe(6.5)
		expect(dossier.benchmark.jobCandidates).toBe(3)
		expect(dossier.benchmark.rankInJob).toBe(1)
		// menos de 5 notas: percentil seria ruído estatístico
		expect(dossier.benchmark.topPercent).toBeNull()
	})

	it('calcula a trilha e acusa risco quando passou do SLA sem decisão', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.trail.daysInProcess).toBe(24)
		expect(dossier.trail.daysInStage).toBe(3)
		expect(dossier.trail.jobMedianDays).toBe(31)
		expect(dossier.trail.atRisk).toBe(true)
	})

	it('não acusa risco quando o candidato já tem decisão', async () => {
		infra.candidateRepository.getJobInterview.mockResolvedValue(
			interviewDoc({ candidateStatus: 'Approved' }) as never,
		)

		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.trail.atRisk).toBe(false)
	})

	it('separa skill verificada na entrevista de skill só declarada', async () => {
		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		/*
		 * `objectContaining` porque a skill ganhou evidência (score, nível, trecho)
		 * junto do veredito. O que este teste afirma é a SEPARAÇÃO entre declarada
		 * e verificada — comparar o objeto inteiro fazia dele um teste de formato,
		 * que quebra a cada campo novo sem dizer nada sobre a regra.
		 */
		expect(dossier.skills).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'Node.js', verified: true, source: 'mentioned' }),
				expect.objectContaining({ name: 'Kafka', verified: true, source: 'mentioned' }),
				expect.objectContaining({ name: 'Terraform', verified: false, source: 'declared' }),
			]),
		)
		// não duplica: Node.js foi declarada E verificada, vale a verificada
		expect(dossier.skills.filter((s) => s.name === 'Node.js')).toHaveLength(1)
	})

	it('devolve dossiê sem entrevista quando o candidato só se candidatou', async () => {
		infra.candidateRepository.getJobApplied.mockResolvedValue({ id: 'ja-1' } as never)

		const dossier = await service().getDossier({
			companyId: COMPANY_ID,
			jobId: JOB_ID,
			candidateId: CANDIDATE_ID,
		})

		expect(dossier.interview).toBeNull()
		expect(dossier.application.stage).toBe('selected')
	})

	it('recusa candidato que não é da vaga', async () => {
		infra.candidateRepository.getJobInterview.mockResolvedValue(null as never)

		await expect(
			service().getDossier({ companyId: COMPANY_ID, jobId: JOB_ID, candidateId: 'outro' }),
		).rejects.toThrow(/not found/i)
	})

	})
