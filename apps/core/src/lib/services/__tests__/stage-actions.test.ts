import { createKanbanService } from '../kanban-service'

function infraWith(company: Record<string, unknown> = {}) {
	const updateCompany = jest.fn().mockResolvedValue(undefined)
	return {
		infra: {
			companyRepository: {
				getCompany: jest.fn().mockResolvedValue({ id: 'c1', ...company }),
				updateCompany,
			},
		} as never,
		updateCompany,
	}
}

describe('ações por etapa', () => {
	it('lista as etapas da régua + as colunas da empresa, sem reprovado', async () => {
		const { infra } = infraWith({
			kanbanCustomColumns: [{ id: 'teste-tecnico', label: 'Teste técnico', color: '#fff' }],
		})
		const result = await createKanbanService(infra).getStageActions('c1')

		expect(result.stages.map((stage) => stage.id)).toContain('teste-tecnico')
		expect(result.stages.map((stage) => stage.id)).toContain('selected')
		/*
		 * Reprovado tem caminho próprio (motivo tipado + e-mail de retorno). Uma
		 * ação genérica ali mandaria um segundo e-mail para quem acabou de ser
		 * reprovado.
		 */
		expect(result.stages.map((stage) => stage.id)).not.toContain('rejected')
		expect(result.available).toEqual(['invite_interview', 'request_resume'])
	})

	it('grava só o que tem ação — etapa com lista vazia sai do mapa', async () => {
		const { infra, updateCompany } = infraWith()
		await createKanbanService(infra).saveStageActions('c1', {
			selected: ['invite_interview'],
			approved: [],
		})

		expect(updateCompany).toHaveBeenCalledWith('c1', {
			stageActions: { selected: ['invite_interview'] },
		})
	})

	it('recusa etapa que não existe', async () => {
		const { infra, updateCompany } = infraWith()
		await expect(
			createKanbanService(infra).saveStageActions('c1', { inventada: ['invite_interview'] }),
		).rejects.toThrow(/desconhecida/i)
		expect(updateCompany).not.toHaveBeenCalled()
	})

	it('recusa ação em reprovado', async () => {
		const { infra } = infraWith()
		await expect(
			createKanbanService(infra).saveStageActions('c1', { rejected: ['invite_interview'] }),
		).rejects.toThrow(/não aceita ações/i)
	})

	it('não duplica a mesma ação', async () => {
		const { infra, updateCompany } = infraWith()
		await createKanbanService(infra).saveStageActions('c1', {
			selected: ['invite_interview', 'invite_interview'],
		})
		expect(updateCompany).toHaveBeenCalledWith('c1', {
			stageActions: { selected: ['invite_interview'] },
		})
	})
})
