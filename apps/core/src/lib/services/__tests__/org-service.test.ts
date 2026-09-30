import { validateCustomFields, type CustomFieldDefinition } from '@coploy/domain'

import { createOrgService } from '../org-service'

function makeInfra(units: unknown[] = [], fields: unknown[] = []) {
	return {
		orgRepository: {
			listOrgUnits: jest.fn().mockResolvedValue(units),
			createOrgUnit: jest.fn().mockImplementation((_c, data) => ({ id: 'u1', ...data })),
			updateOrgUnit: jest.fn().mockResolvedValue(undefined),
			listCustomFields: jest.fn().mockResolvedValue(fields),
			createCustomField: jest.fn().mockImplementation((_c, data) => ({ id: 'f1', ...data })),
			updateCustomField: jest.fn().mockResolvedValue(undefined),
			deleteEmailTemplate: jest.fn().mockResolvedValue(undefined),
		},
	} as never
}

describe('estrutura organizacional', () => {
	it('recusa unidade duplicada no mesmo tipo', async () => {
		const service = createOrgService(makeInfra([{ id: 'u0', kind: 'area', name: 'Tecnologia' }]))
		await expect(
			service.createOrgUnit({ companyId: 'c1', kind: 'area', name: 'tecnologia' }),
		).rejects.toThrow(/já existe/i)
	})

	it('hierarquia é LIVRE entre tipos — a empresa real pensa numa árvore só (decisão 2026-08-22)', async () => {
		const service = createOrgService(
			makeInfra([{ id: 'u1', kind: 'unit', name: 'São Paulo' }]),
		)
		await expect(
			service.createOrgUnit({ companyId: 'c1', kind: 'area', name: 'Tecnologia', parentId: 'u1' }),
		).resolves.toBeTruthy()
	})
})

describe('campos customizados', () => {
	it('gera chave estável a partir do rótulo', async () => {
		const infra = makeInfra()
		const service = createOrgService(infra)
		const field = await service.createCustomField({
			companyId: 'c1',
			entity: 'job',
			label: 'Nº da requisição',
			type: 'text',
		})
		expect(field.key).toBe('n_da_requisicao')
	})

	it('select sem opções é rejeitado', async () => {
		const service = createOrgService(makeInfra())
		await expect(
			service.createCustomField({ companyId: 'c1', entity: 'job', label: 'Turno', type: 'select' }),
		).rejects.toThrow(/opções/)
	})

	it('devolve TODOS os erros de uma vez, não o primeiro', () => {
		const definitions = [
			{ key: 'a', label: 'A', type: 'number', required: true, active: true },
			{ key: 'b', label: 'B', type: 'date', required: false, active: true },
		] as CustomFieldDefinition[]

		const errors = validateCustomFields(definitions, { a: null, b: 'não é data' })
		expect(errors).toHaveLength(2)
	})
})

describe('voltar ao padrão do e-mail', () => {
	it('apaga o texto do cliente — sem registro, o envio já usa a cópia padrão', async () => {
		const infra = makeInfra()
		await createOrgService(infra).resetEmailTemplate({
			companyId: 'c1',
			kind: 'interview_invite',
		})
		expect(
			(infra as unknown as { orgRepository: { deleteEmailTemplate: jest.Mock } }).orgRepository
				.deleteEmailTemplate,
		).toHaveBeenCalledWith('c1', 'interview_invite')
	})

	it('recusa tipo que não existe antes de apagar qualquer coisa', async () => {
		const infra = makeInfra()
		await expect(
			createOrgService(infra).resetEmailTemplate({ companyId: 'c1', kind: 'inventado' }),
		).rejects.toThrow(/inválido/i)
		expect(
			(infra as unknown as { orgRepository: { deleteEmailTemplate: jest.Mock } }).orgRepository
				.deleteEmailTemplate,
		).not.toHaveBeenCalled()
	})
})

describe('remover unidade e campo', () => {
	function infraWith(units: unknown[] = [], fields: unknown[] = []) {
		const updateOrgUnit = jest.fn().mockResolvedValue(undefined)
		const updateCustomField = jest.fn().mockResolvedValue(undefined)
		return {
			infra: {
				orgRepository: {
					listOrgUnits: jest.fn().mockResolvedValue(units),
					listCustomFields: jest.fn().mockResolvedValue(fields),
					updateOrgUnit,
					updateCustomField,
				},
			} as never,
			updateOrgUnit,
			updateCustomField,
		}
	}

	it('desativa em vez de apagar — a vaga antiga precisa do histórico', async () => {
		const { infra, updateOrgUnit } = infraWith([{ id: 'u1', kind: 'area', name: 'RH' }])
		await createOrgService(infra).setOrgUnitActive({ companyId: 'c1', id: 'u1', active: false })
		expect(updateOrgUnit).toHaveBeenCalledWith('c1', 'u1', { active: false })
	})

	it('unidade desativada some da listagem', async () => {
		const { infra } = infraWith([
			{ id: 'u1', kind: 'area', name: 'RH', active: true },
			{ id: 'u2', kind: 'area', name: 'x', active: false },
		])
		const { units } = await createOrgService(infra).listOrgUnits('c1')
		expect(units.map((unit) => (unit as { id: string }).id)).toEqual(['u1'])
	})

	it('mas continua visível quando pedida explicitamente', async () => {
		const { infra } = infraWith([
			{ id: 'u1', kind: 'area', name: 'RH', active: true },
			{ id: 'u2', kind: 'area', name: 'x', active: false },
		])
		const { units } = await createOrgService(infra).listOrgUnits('c1', { includeInactive: true })
		expect(units).toHaveLength(2)
	})

	it('unidade sem `active` conta como ativa — a base inteira nasceu assim', async () => {
		const { infra } = infraWith([{ id: 'u1', kind: 'area', name: 'RH' }])
		const { units } = await createOrgService(infra).listOrgUnits('c1')
		expect(units).toHaveLength(1)
	})

	it('recusa id que não é da empresa antes de gravar', async () => {
		const { infra, updateOrgUnit } = infraWith([{ id: 'u1' }])
		await expect(
			createOrgService(infra).setOrgUnitActive({ companyId: 'c1', id: 'de-outra', active: false }),
		).rejects.toThrow(/não encontrada/i)
		expect(updateOrgUnit).not.toHaveBeenCalled()
	})

	it('campo desativado some da listagem', async () => {
		const { infra, updateCustomField } = infraWith(
			[],
			[
				{ id: 'f1', entity: 'job', key: 'cnh', active: true },
				{ id: 'f2', entity: 'job', key: 'velho', active: false },
			],
		)
		const service = createOrgService(infra)
		await service.setCustomFieldActive({ companyId: 'c1', id: 'f1', active: false })
		expect(updateCustomField).toHaveBeenCalledWith('c1', 'f1', { active: false })

		const { fields } = await service.listCustomFields({ companyId: 'c1' })
		expect(fields.map((field) => (field as { id: string }).id)).toEqual(['f1'])
	})
})
