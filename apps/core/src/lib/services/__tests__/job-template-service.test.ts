import { createJobTemplateService } from '@/lib/services/job-template-service'
import { jobTemplateContentFrom } from '@coploy/domain'
import { createMockInfra } from './mock-infra'

function servico() {
	const infra = createMockInfra()
	return { infra, service: createJobTemplateService(infra as never) }
}

describe('o que vira modelo', () => {
	/**
	 * O invariante da leva: o modelo guarda CONTEÚDO, nunca identidade.
	 *
	 * Um `creatorId` copiado transformaria o modelo em máquina de atribuir vaga
	 * a quem já saiu da empresa — e o candidato herdaria estado de outra vaga.
	 */
	it('não carrega nada que identifique a vaga de origem', () => {
		const content = jobTemplateContentFrom({
			jobDescription: 'Trabalhar com Node.',
			carrerLevel: 'Pleno',
			id: 'vaga-123',
			creatorId: 'user-1',
			creatorName: 'Ana',
			usersApplied: [{ id: 'x' }],
			status: 'open',
			public: true,
			stopped: false,
			timeCreated: new Date(),
			interviewUrl: 'https://exemplo/vaga',
			identifier: 'VG-1',
		}) as Record<string, unknown>

		expect(content).toEqual({
			jobDescription: 'Trabalhar com Node.',
			carrerLevel: 'Pleno',
		})
	})

	it('leva o processo junto, não só o texto', () => {
		const content = jobTemplateContentFrom({
			jobDescription: 'x',
			kanbanConfig: { columns: [{ id: 'pending', order: 0 }] },
			jobQuestions: [{ id: 'q1', question: 'Fale de você' }],
			knockoutTree: { nodes: [] },
			structuredRequirements: [{ id: 'r1', label: 'Node', weight: 3, required: true }],
		}) as Record<string, unknown>

		expect(Object.keys(content).sort()).toEqual([
			'jobDescription',
			'jobQuestions',
			'kanbanConfig',
			'knockoutTree',
			'structuredRequirements',
		])
	})

	it('campo vazio não entra — modelo não propaga string em branco', () => {
		const content = jobTemplateContentFrom({
			jobDescription: 'x',
			benefits: '',
			jobRequirements: null,
			carrerLevel: undefined,
		}) as Record<string, unknown>
		expect(content).toEqual({ jobDescription: 'x' })
	})
})

describe('serviço de modelos', () => {
	it('recusa modelo sem nome — ninguém o reconheceria na lista', async () => {
		const { service } = servico()
		await expect(service.createTemplate('c1', 'u1', { name: '  ' })).rejects.toThrow(
			/nome/i,
		)
	})

	it('salvar a partir da vaga usa o conteúdo dela', async () => {
		const { infra, service } = servico()
		infra.jobRepository.getJob.mockResolvedValue({
			jobName: 'Dev Pleno',
			jobDescription: 'Node e React.',
			carrerLevel: 'Pleno',
			creatorId: 'quem-escreveu',
		})
		infra.userRepository.getUsersCompany.mockResolvedValue({ display_name: 'Ana' })
		infra.jobTemplateRepository.createJobTemplate.mockResolvedValue({ id: 't1' })

		await service.createFromJob('c1', 'u1', 'vaga-1', 'Dev Pleno padrão')

		const gravado = infra.jobTemplateRepository.createJobTemplate.mock.calls[0][1]
		expect(gravado.name).toBe('Dev Pleno padrão')
		expect(gravado.jobDescription).toBe('Node e React.')
		expect(gravado.creatorId).toBeUndefined()
	})

	it('vaga inexistente não vira modelo', async () => {
		const { infra, service } = servico()
		infra.jobRepository.getJob.mockResolvedValue(null)
		await expect(service.createFromJob('c1', 'u1', 'nao-existe', 'X')).rejects.toThrow(
			/vaga/i,
		)
	})

	/** Autor é enfeite: falha ao buscá-lo não pode impedir salvar o trabalho. */
	it('salva mesmo se o nome do autor não puder ser lido', async () => {
		const { infra, service } = servico()
		infra.userRepository.getUsersCompany.mockRejectedValue(new Error('offline'))
		infra.jobTemplateRepository.createJobTemplate.mockResolvedValue({ id: 't1' })

		const criado = await service.createTemplate('c1', 'u1', { name: 'Modelo' })
		expect(criado.id).toBe('t1')
	})

	it('a lista esconde o que foi removido', async () => {
		const { infra, service } = servico()
		infra.jobTemplateRepository.listJobTemplates.mockResolvedValue([
			{ id: 't1', name: 'Vivo', active: true },
			{ id: 't2', name: 'Removido', active: false },
		])
		const lista = await service.listTemplates('c1')
		expect(lista.map((t) => t.id)).toEqual(['t1'])
	})

	it('remover é desativar, não apagar', async () => {
		const { infra, service } = servico()
		infra.jobTemplateRepository.getJobTemplate.mockResolvedValue({
			id: 't1',
			name: 'X',
			active: true,
		})
		await service.deactivateTemplate('c1', 't1')
		expect(infra.jobTemplateRepository.updateJobTemplate).toHaveBeenCalledWith(
			'c1',
			't1',
			{ active: false },
		)
	})

	it('modelo removido não pode ser lido pelo id', async () => {
		const { infra, service } = servico()
		infra.jobTemplateRepository.getJobTemplate.mockResolvedValue({
			id: 't1',
			name: 'X',
			active: false,
		})
		await expect(service.getTemplate('c1', 't1')).rejects.toThrow(/não encontrado/i)
	})
})

/**
 * A régua da aplicação do modelo mora no ATS (`aplicarModelo`), mas o contrato
 * que ela depende é este: o que o modelo carrega. Se um dia `jobName` entrar em
 * `JOB_TEMPLATE_CONTENT_FIELDS`, a função do formulário passaria a sobrescrever
 * o cargo digitado — e o teste abaixo é o que avisa.
 */
describe('o que o modelo NÃO decide pela pessoa', () => {
	it('o cargo não é conteúdo — é sugestão, tratada à parte', () => {
		const content = jobTemplateContentFrom({
			jobName: 'Dev Pleno',
			jobDescription: 'x',
		}) as Record<string, unknown>
		expect(content.jobName).toBeUndefined()
	})
})

/**
 * "O padrão é o último modelo usado para aquele cargo."
 *
 * Sem a data de uso, a sugestão teria que cair na ordem de criação — que
 * envelhece ao contrário: o primeiro modelo que alguém cadastrou ficaria sendo
 * a sugestão para sempre, mesmo depois de a equipe adotar outro.
 */
describe('marcar o modelo como usado', () => {
	it('grava a data de uso no modelo', async () => {
		const { infra, service } = servico()
		await service.markUsed('c1', 't1')
		expect(infra.jobTemplateRepository.updateJobTemplate).toHaveBeenCalledWith(
			'c1',
			't1',
			expect.objectContaining({ lastUsedAt: expect.any(Date) }),
		)
	})

	/*
	 * A vaga vale mais que o carimbo. Quem chama engole o erro — este teste
	 * garante que o service não faz nada além de gravar, para que engolir seja
	 * seguro.
	 */
	it('não toca em mais nada do modelo', async () => {
		const { infra, service } = servico()
		await service.markUsed('c1', 't1')
		const [, , patch] = (
			infra.jobTemplateRepository.updateJobTemplate as jest.Mock
		).mock.calls[0]
		expect(Object.keys(patch)).toEqual(['lastUsedAt'])
	})
})
