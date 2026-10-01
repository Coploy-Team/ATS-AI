import { createKnockoutConfigService } from '../knockout-config-service'
import { createMockInfra } from './mock-infra'

describe('createKnockoutConfigService', () => {
	const COMPANY_ID = 'comp-1'
	const JOB_ID = 'job-1'

	let infra: ReturnType<typeof createMockInfra>

	const booleanNode = {
		id: 'n1',
		question: 'Tem CNH categoria D?',
		type: 'boolean' as const,
		rule: { operator: 'equals' as const, value: true },
		onFail: 'knockout' as const,
	}

	beforeEach(() => {
		infra = createMockInfra()
		infra.jobRepository.getJob.mockResolvedValue({ id: JOB_ID } as never)
		infra.jobRepository.updateJob.mockResolvedValue(undefined as never)
	})

	const service = () => createKnockoutConfigService(infra)

	describe('getKnockout', () => {
		it('distingue "nunca configurou" de "configurou vazio"', async () => {
			const notConfigured = await service().getKnockout(COMPANY_ID, JOB_ID)
			expect(notConfigured).toEqual({ knockoutTree: null, configured: false })

			infra.jobRepository.getJob.mockResolvedValue({
				id: JOB_ID,
				knockoutTree: { version: 2, nodes: [] },
			} as never)
			const emptyTree = await service().getKnockout(COMPANY_ID, JOB_ID)
			expect(emptyTree.configured).toBe(false)
		})

		it('devolve a árvore quando existe', async () => {
			infra.jobRepository.getJob.mockResolvedValue({
				id: JOB_ID,
				knockoutTree: { version: 3, nodes: [booleanNode] },
			} as never)

			const result = await service().getKnockout(COMPANY_ID, JOB_ID)
			expect(result.configured).toBe(true)
			expect(result.knockoutTree?.nodes).toHaveLength(1)
		})
	})

	describe('saveKnockout', () => {
		it('grava e começa na versão 1', async () => {
			const { knockoutTree } = await service().saveKnockout({
				companyId: COMPANY_ID,
				jobId: JOB_ID,
				nodes: [booleanNode],
			})

			expect(knockoutTree.version).toBe(1)
			expect(infra.jobRepository.updateJob).toHaveBeenCalledWith(
				COMPANY_ID,
				JOB_ID,
				expect.objectContaining({ knockoutTree: expect.objectContaining({ version: 1 }) }),
			)
		})

		// Candidatura avaliada guarda o snapshot da árvore que respondeu — a
		// versão precisa avançar sozinha pra auditoria não ficar ambígua.
		it('incrementa a versão a cada gravação, ignorando o que o cliente mandaria', async () => {
			infra.jobRepository.getJob.mockResolvedValue({
				id: JOB_ID,
				knockoutTree: { version: 7, nodes: [] },
			} as never)

			const { knockoutTree } = await service().saveKnockout({
				companyId: COMPANY_ID,
				jobId: JOB_ID,
				nodes: [booleanNode],
			})

			expect(knockoutTree.version).toBe(8)
		})

		it('recusa mais perguntas que o teto — knockout longo vira funil longo', async () => {
			const nodes = Array.from({ length: 11 }, (_, i) => ({ ...booleanNode, id: `n${i}` }))

			await expect(
				service().saveKnockout({ companyId: COMPANY_ID, jobId: JOB_ID, nodes }),
			).rejects.toThrow(/at most 10/)
			expect(infra.jobRepository.updateJob).not.toHaveBeenCalled()
		})

		it('recusa ids duplicados', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [booleanNode, { ...booleanNode }],
				}),
			).rejects.toThrow(/duplicated id/)
		})

		// Regra incoerente com o tipo faz o avaliador comparar coisas sem sentido
		// e reprovar candidato por dado malformado.
		it('recusa operador numérico em pergunta não numérica', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [{ ...booleanNode, rule: { operator: 'greater_than', value: 3 } }],
				}),
			).rejects.toThrow(/number question/)
		})

		it('recusa valor não booleano em pergunta booleana', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [{ ...booleanNode, rule: { operator: 'equals', value: 'sim' } }],
				}),
			).rejects.toThrow(/boolean value/)
		})

		it('recusa single-choice com menos de duas opções', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [
						{
							id: 'n1',
							question: 'Qual seu nível de inglês?',
							type: 'single-choice',
							options: ['Avançado'],
							rule: { operator: 'in', value: ['Avançado'] },
							onFail: 'knockout',
						},
					],
				}),
			).rejects.toThrow(/at least 2 options/)
		})

		it('recusa regra que aponta pra opção inexistente', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [
						{
							id: 'n1',
							question: 'Qual seu nível de inglês?',
							type: 'single-choice',
							options: ['Básico', 'Avançado'],
							rule: { operator: 'in', value: ['Fluente'] },
							onFail: 'knockout',
						},
					],
				}),
			).rejects.toThrow(/do not exist/)
		})

		it('aceita pergunta numérica com operador numérico', async () => {
			await expect(
				service().saveKnockout({
					companyId: COMPANY_ID,
					jobId: JOB_ID,
					nodes: [
						{
							id: 'n1',
							question: 'Quantos anos de experiência com Node?',
							type: 'number',
							rule: { operator: 'greater_than_or_equal', value: 3 },
							onFail: 'flag',
						},
					],
				}),
			).resolves.toMatchObject({ knockoutTree: { version: 1 } })
		})

		it('recusa vaga inexistente', async () => {
			infra.jobRepository.getJob.mockResolvedValue(null as never)

			await expect(
				service().saveKnockout({ companyId: COMPANY_ID, jobId: 'sumiu', nodes: [booleanNode] }),
			).rejects.toThrow(/not found/i)
		})
	})
})
