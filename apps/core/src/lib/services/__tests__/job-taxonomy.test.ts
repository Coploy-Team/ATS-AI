import {
	allowedJobCategories,
	assertJobCategoryAllowed,
	baseJobCategories,
	jobCategoriesIsArea,
} from '../job-taxonomy'

/** Uma empresa que cadastrou áreas próprias. */
function infraCom(categorias: string[] | null) {
	return {
		companyRepository: {
			getCompany: async () => ({ jobCategories: categorias }),
		},
	}
}

describe('job taxonomy — a área da vaga', () => {
	let permitidas: string[]

	beforeAll(async () => {
		permitidas = await allowedJobCategories('empresa-qualquer')
	})

	it('não oferece o curinga de filtro como área', () => {
		expect(permitidas).not.toContain('all')
		expect(permitidas.length).toBeGreaterThan(50)
	})

	it('aceita área da lista', () => {
		expect(() =>
			assertJobCategoryAllowed('Tecnologia da Informação', undefined, permitidas),
		).not.toThrow()
	})

	it('recusa área desconhecida na criação', () => {
		expect(() => assertJobCategoryAllowed('Tecnologia', undefined, permitidas)).toThrow(
			/não é uma área de vaga conhecida/,
		)
	})

	/*
	 * O caso que mais importa: a base legada. O formulário devolve o rascunho
	 * inteiro ao salvar, então recusar sem esta saída deixaria a vaga antiga
	 * ineditável — quem tenta arrumá-la é quem apanharia.
	 */
	it('deixa editar vaga legada que já carrega área fora da lista', () => {
		expect(() =>
			assertJobCategoryAllowed('Tecnologia', 'Tecnologia', permitidas),
		).not.toThrow()
	})

	it('recusa TROCAR de uma área legada para outra desconhecida', () => {
		expect(() =>
			assertJobCategoryAllowed('Outra Coisa', 'Tecnologia', permitidas),
		).toThrow(/não é uma área de vaga conhecida/)
	})

	it('campo ausente não é escolha, e limpar é permitido', () => {
		expect(() => assertJobCategoryAllowed(undefined, undefined, permitidas)).not.toThrow()
		expect(() => assertJobCategoryAllowed('', 'Tecnologia', permitidas)).not.toThrow()
		expect(() => assertJobCategoryAllowed(null, undefined, permitidas)).not.toThrow()
	})

	it('recusa o curinga de filtro como valor gravado', () => {
		expect(() => assertJobCategoryAllowed('all', undefined, permitidas)).toThrow()
	})

	it('recusa valor que não é texto', () => {
		expect(() => assertJobCategoryAllowed(42, undefined, permitidas)).toThrow(
			/precisa ser um texto/,
		)
	})
})

/*
 * A lista do servidor e a que a tela oferece precisam ser a MESMA. Se elas
 * divergirem, a pessoa escolhe na tela uma área que a gravação recusa — e o
 * erro aparece no salvar, sem nada para consertar.
 */
describe('a lista do servidor casa com a que o ATS oferece', () => {
	it('toda área oferecida na tela é aceita na gravação', async () => {
		const fs = require('node:fs') as typeof import('node:fs')
		const path = require('node:path') as typeof import('node:path')
		const arquivo = path.resolve(
			__dirname,
			'../../../../../../web/ats/src/features/job-form/job-options.ts',
		)
		if (!fs.existsSync(arquivo)) return /* espelho público não carrega o ATS */

		const fonte = fs.readFileSync(arquivo, 'utf8')
		const bloco = fonte.split('export const CATEGORIES: string[] = [')[1]?.split(']')[0] ?? ''
		const daTela = Array.from(bloco.matchAll(/'([^']+)'/g)).map((m) => m[1])
		expect(daTela.length).toBeGreaterThan(50)

		const permitidas = await allowedJobCategories('empresa-qualquer')
		expect(daTela.filter((c) => !permitidas.includes(c))).toEqual([])
	})
})


/*
 * A leva da tela de administração: a empresa ACRESCENTA, nunca substitui. As
 * fixas são vocabulário compartilhado — é por elas que o hunting e o portal
 * encontram vaga entre empresas diferentes.
 */
describe('áreas próprias da empresa', () => {
	it('somam às nossas, sem tirar nenhuma', async () => {
		const base = baseJobCategories()
		const lista = await allowedJobCategories('c1', infraCom(['Operações de Loja']))
		expect(lista).toEqual([...base, 'Operações de Loja'])
	})

	it('a área própria passa a ser gravável', async () => {
		const lista = await allowedJobCategories('c1', infraCom(['Operações de Loja']))
		expect(() =>
			assertJobCategoryAllowed('Operações de Loja', undefined, lista),
		).not.toThrow()
	})

	/* O recorte é por empresa: o que a vizinha cadastrou não vale aqui. */
	it('a área de OUTRA empresa continua recusada', async () => {
		const lista = await allowedJobCategories('c1', infraCom([]))
		expect(() =>
			assertJobCategoryAllowed('Operações de Loja', undefined, lista),
		).toThrow(/não é uma área de vaga conhecida/)
	})

	it('empresa sem lista própria fica com as nossas', async () => {
		expect(await allowedJobCategories('c1', infraCom(null))).toEqual(baseJobCategories())
	})

	/* Leitura instável da empresa não pode travar a gravação de vaga. */
	it('se a empresa não puder ser lida, o catálogo base ainda vale', async () => {
		const infra = {
			companyRepository: {
				getCompany: async () => {
					throw new Error('firestore fora do ar')
				},
			},
		}
		expect(await allowedJobCategories('c1', infra)).toEqual(baseJobCategories())
	})
})

describe('job taxonomy — quais tipos de vaga carregam área', () => {
	it('entrevista (ou tipo ausente) carrega área', () => {
		expect(jobCategoriesIsArea('interview')).toBe(true)
		expect(jobCategoriesIsArea(undefined)).toBe(true)
		expect(jobCategoriesIsArea(null)).toBe(true)
	})

	/* A avaliação grava o segmento da conversa no mesmo campo. */
	it('avaliação e os demais tipos não carregam área', () => {
		expect(jobCategoriesIsArea('evaluation')).toBe(false)
		expect(jobCategoriesIsArea('exitJob')).toBe(false)
		expect(jobCategoriesIsArea('emotional')).toBe(false)
	})
})
