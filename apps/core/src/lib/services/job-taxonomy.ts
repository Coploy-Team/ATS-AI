import { BadRequestError } from '@coploy/shared/errors'

import { JobCategories } from '@/http/constants/job-filters'

/**
 * A taxonomia da vaga — hoje só a área (`jobCategories`).
 *
 * O defeito que originou este arquivo: a GRAVAÇÃO aceitava qualquer texto e o
 * FILTRO validava contra enum. Dava para salvar vaga com uma área que nenhuma
 * tela sabia exibir e nenhum filtro alcançava — a vaga sumia da busca por área
 * sem que ninguém tivesse errado nada visível.
 */

/**
 * `all` é curinga de FILTRO ("qualquer área"), não uma área.
 *
 * Gravar `all` numa vaga diria que ela pertence a uma categoria chamada "all",
 * que não existe em tela nenhuma.
 */
const CURINGA_DE_FILTRO = JobCategories.ALL

/** As áreas que servimos a todo mundo — vocabulário compartilhado. */
export function baseJobCategories(): string[] {
	return Object.values(JobCategories).filter((c) => c !== CURINGA_DE_FILTRO)
}

/**
 * As áreas que esta empresa pode escolher: as nossas MAIS as dela.
 *
 * ⚠️ Soma, nunca substitui. As fixas são o vocabulário que faz o hunting e o
 * portal público encontrarem vaga ENTRE empresas; deixar um cliente renomear ou
 * apagar uma delas quebraria a busca dos outros e deixaria vaga antiga apontando
 * para um nome que deixou de existir.
 *
 * A empresa não é lida quando `infra` não vem: o guard de escrita chama sempre
 * com ela, e os chamadores de leitura que só querem o catálogo base usam
 * `baseJobCategories`.
 */
export async function allowedJobCategories(
	companyId: string,
	infra?: { companyRepository: { getCompany: (id: string) => Promise<unknown> } },
): Promise<string[]> {
	const base = baseJobCategories()
	if (!infra) return base

	const company = (await infra.companyRepository
		.getCompany(companyId)
		.catch(() => null)) as { jobCategories?: string[] | null } | null

	const daEmpresa = (company?.jobCategories ?? []).filter(
		(c) => typeof c === 'string' && c.trim() !== '',
	)
	/* dedupe preservando a ordem: a nossa primeiro, a dela depois */
	return [...base, ...daEmpresa.filter((c) => !base.includes(c))]
}

/**
 * Só a vaga de ENTREVISTA carrega área em `jobCategories`.
 *
 * ⚠️ A avaliação de idioma (e os outros tipos) grava no mesmo campo o
 * SEGMENTO da conversa ("Educação e Formação", "Perguntas Pessoais"…), que é
 * outro vocabulário e nunca entra na busca por área. Validar esse valor contra
 * a lista de áreas recusava toda avaliação nova. Tipo ausente conta como
 * entrevista — é o padrão da criação.
 */
export function jobCategoriesIsArea(typeInterview: unknown): boolean {
	return typeInterview === undefined || typeInterview === null || typeInterview === 'interview'
}

/**
 * Recusa área desconhecida — sem trancar quem já tem uma.
 *
 * ⚠️ `atual` é o que a vaga já guarda. Vaga antiga (importação da Gupy, API,
 * base legada) pode carregar área fora da lista, e o formulário devolve o
 * rascunho INTEIRO ao salvar: recusar sem essa saída deixaria a vaga
 * ineditável — puniria exatamente quem está tentando arrumá-la. A régua é a
 * mesma da publicação: cobra-se na MUDANÇA, não do que já existe.
 */
export function assertJobCategoryAllowed(
	valor: unknown,
	atual: unknown,
	permitidas: string[],
): void {
	/* Não mandou o campo: não é uma escolha, é ausência. */
	if (valor === undefined) return
	/* Limpar a área é permitido — publicar é que vai cobrar. */
	if (valor === null || valor === '') return

	if (typeof valor !== 'string') {
		throw new BadRequestError('A área da vaga precisa ser um texto')
	}
	if (permitidas.includes(valor)) return
	/* Continua sendo o que já era: não houve escolha nova para recusar. */
	if (typeof atual === 'string' && valor === atual) return

	throw new BadRequestError(
		`"${valor}" não é uma área de vaga conhecida. Escolha uma da lista — é ela que faz a vaga aparecer na busca por área.`,
	)
}
