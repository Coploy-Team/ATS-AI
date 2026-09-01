import { SEED_OCCUPATIONS, SEED_SKILLS } from '../../taxonomy/seed'
import { createTaxonomyService, editDistance, similarity } from '../taxonomy-service'
import { createMockInfra } from './mock-infra'

function setup() {
	const infra = createMockInfra()
	infra.taxonomyRepository.listOccupations = jest.fn().mockResolvedValue(SEED_OCCUPATIONS)
	infra.taxonomyRepository.listSkills = jest.fn().mockResolvedValue(SEED_SKILLS)
	return { infra, service: createTaxonomyService(infra) }
}

describe('distância de edição', () => {
	it('mede o que promete', () => {
		expect(editDistance('react', 'react')).toBe(0)
		expect(editDistance('reactt', 'react')).toBe(1)
		expect(similarity('react', 'react')).toBe(1)
	})
})

describe('resolveOccupation — tabela-verdade dos cargos da base', () => {
	/*
	 * Casos reais do campo de cargo. É o teste que diz se a taxonomia serve:
	 * a mesma entrada tem que dar a mesma saída sempre — nenhum LLM envolvido.
	 */
	const CASES: Array<[input: string, expectedCode: string]> = [
		['Desenvolvedor de Software', 'cbo:2124-05'],
		['desenvolvedor', 'cbo:2124-05'],
		['Software Engineer', 'cbo:2124-05'],
		['Dev Full Stack', 'cbo:2124-30'],
		['Desenvolvedor Fullstack', 'cbo:2124-30'],
		['FullStack Developer', 'cbo:2124-30'],
		['QA', 'cbo:2124-35'],
		['Analista de Testes', 'cbo:2124-35'],
		['Product Manager', 'cbo:1425-05'],
		['Product Design', 'cbo:2624-05'],
		['UX Designer', 'cbo:2624-05'],
		['Analista de RH', 'cbo:2521-05'],
		['Auxiliar de Limpeza', 'cbo:5143-20'],
		['Fiscal de Ônibus', 'cbo:5174-10'],
		['Tech Lead', 'cbo:1421-05'],
		['Data Scientist', 'cbo:2124-40'],
	]

	it.each(CASES)('%s → %s', async (input, expected) => {
		const { service } = setup()
		const match = await service.resolveOccupation(input)
		expect(match?.occupation.id).toBe(expected)
	})

	it('acento e caixa não mudam o resultado', async () => {
		const { service } = setup()
		const a = await service.resolveOccupation('FISCAL DE ÔNIBUS')
		const b = await service.resolveOccupation('fiscal de onibus')
		expect(a?.occupation.id).toBe(b?.occupation.id)
	})

	it('erro de digitação ainda casa', async () => {
		const { service } = setup()
		const match = await service.resolveOccupation('desenvolvedorr')
		expect(match?.occupation.id).toBe('cbo:2124-05')
		expect(match?.matchedOn).toBe('fuzzy')
	})

	it('cargo desconhecido devolve null — chutar é pior que não saber', async () => {
		const { service } = setup()
		expect(await service.resolveOccupation('Domador de leões espaciais')).toBeNull()
		expect(await service.resolveOccupation('')).toBeNull()
		expect(await service.resolveOccupation(null)).toBeNull()
	})

	it('substring não vale: "javascript" não casa com cargo nenhum', async () => {
		const { service } = setup()
		/*
		 * "javascript" é linguagem, não cargo. Sem limite de palavra no
		 * casamento por conteúdo, um sinônimo curto casaria dentro dela e a vaga
		 * sairia classificada numa profissão que ninguém escreveu.
		 */
		expect(await service.resolveOccupation('javascript')).toBeNull()
	})

	it('termo mais específico ganha do mais genérico', async () => {
		const { service } = setup()
		const match = await service.resolveOccupation('desenvolvedor front end')
		expect(match?.occupation.id).toBe('cbo:2124-20')
	})

	it('índice é carregado uma vez por processo', async () => {
		const { infra, service } = setup()
		await service.resolveOccupation('QA')
		await service.resolveOccupation('Product Manager')
		expect(infra.taxonomyRepository.listOccupations).toHaveBeenCalledTimes(1)
	})

	it('base vazia não quebra: devolve null', async () => {
		const infra = createMockInfra()
		infra.taxonomyRepository.listOccupations = jest.fn().mockResolvedValue([])
		infra.taxonomyRepository.listSkills = jest.fn().mockResolvedValue([])
		expect(await createTaxonomyService(infra).resolveOccupation('QA')).toBeNull()
	})
})

describe('resolveSkills', () => {
	it('React, ReactJS e React.js resolvem para a mesma skill', async () => {
		const { service } = setup()
		const result = await service.resolveSkills(['React', 'ReactJS', 'React.js'])
		expect(result.canonical).toHaveLength(1)
		expect(result.canonical[0].name).toBe('React')
	})

	it('skill fora do dicionário é aceita como livre, não descartada', async () => {
		const { service } = setup()
		const result = await service.resolveSkills(['React', 'Elixir'])
		expect(result.canonical.map((s) => s.name)).toEqual(['React'])
		expect(result.free).toEqual(['Elixir'])
	})

	it('skill livre entra na fila de curadoria quando pedido', async () => {
		const { infra, service } = setup()
		await service.resolveSkills(['Elixir'], { recordPending: true })
		expect(infra.taxonomyRepository.recordPendingSkill).toHaveBeenCalledWith('elixir', 'free')
	})

	it('falha ao registrar pendência não derruba a resolução', async () => {
		const { infra, service } = setup()
		infra.taxonomyRepository.recordPendingSkill = jest.fn().mockRejectedValue(new Error('down'))
		await expect(
			service.resolveSkills(['Elixir'], { recordPending: true }),
		).resolves.toMatchObject({ free: ['Elixir'] })
	})
})
