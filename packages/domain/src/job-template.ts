/**
 * Modelo de vaga.
 *
 * A décima vaga de "Dev Pleno" custava exatamente o mesmo que a primeira: o
 * formulário abria vazio toda vez, e quem já tinha escrito aquele texto três
 * meses atrás copiava de uma vaga antiga — quando lembrava que ela existia.
 *
 * ⚠️ O modelo guarda o CONTEÚDO da vaga, não a vaga.
 *
 * Nada aqui identifica uma vaga específica: sem estado, sem candidato, sem
 * criador, sem link. É um ponto de partida — usar o modelo PREENCHE o
 * formulário e a pessoa segue editando. Vaga criada não fica ligada ao modelo,
 * e mudar o modelo depois não mexe em vaga nenhuma; o contrário faria uma
 * correção de texto reescrever vagas que já estão no ar.
 */

import type { ScreeningKnockoutTree, StructuredJobRequirement } from './job'

export interface JobTemplateContent {
	/* --- o texto que o candidato lê --- */
	jobDescription?: string | null
	jobRequirements?: string | null
	jobResponsabilities?: string | null
	benefits?: string | null

	/* --- classificação --- */
	carrerLevel?: string | null
	jobCategories?: string | null
	contractType?: string | null
	jobModel?: string | null
	jobHours?: string | null
	language?: string | null

	/* --- como o processo funciona --- */
	mainSkills?: string | null
	structuredRequirements?: StructuredJobRequirement[] | null
	knockoutTree?: ScreeningKnockoutTree | null
	/** Etapas do funil, no formato que a vaga já usa. */
	kanbanConfig?: { columns: Array<{ id: string; order: number }> } | null

	/* --- o que só existe com o Motor --- */
	jobQuestions?: Array<{ id: string; question: string }> | null
	competencias_criticas?: string | null
	competencias_adicionais?: string | null
}

export interface JobTemplate extends JobTemplateContent {
	id: string
	companyId: string
	/** Como a pessoa reconhece o modelo na lista. */
	name: string
	/** Cargo sugerido — vira o nome da vaga, e a pessoa ajusta. */
	jobName?: string | null
	description?: string | null
	active: boolean
	createdByUserId?: string | null
	createdByName?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
	/**
	 * Quando este modelo virou vaga pela última vez.
	 *
	 * É o que faz o modelo CERTO aparecer sozinho: quem abre uma vaga de "Dev
	 * Pleno" quer o modelo de Dev Pleno que a equipe usou por último, não o
	 * primeiro que alguém cadastrou. Ausente = nunca foi usado, e aí vale a
	 * ordem de criação.
	 *
	 * ⚠️ Não cria vínculo entre vaga e modelo — continua sendo ponto de partida.
	 * O que se guarda é a data, não qual vaga saiu dali.
	 */
	lastUsedAt?: Date | string | null
}

/** Os campos que viajam do modelo para o formulário. */
export const JOB_TEMPLATE_CONTENT_FIELDS = [
	'jobDescription',
	'jobRequirements',
	'jobResponsabilities',
	'benefits',
	'carrerLevel',
	'jobCategories',
	'contractType',
	'jobModel',
	'jobHours',
	'language',
	'mainSkills',
	'structuredRequirements',
	'knockoutTree',
	'kanbanConfig',
	'jobQuestions',
	'competencias_criticas',
	'competencias_adicionais',
] as const

/**
 * Extrai o conteúdo reaproveitável de uma vaga.
 *
 * ⚠️ Allowlist, não `delete` do que não serve. A vaga tem quase setenta campos
 * e ganha campos novos toda semana; a régua negativa deixaria vazar o próximo —
 * um `creatorId` copiado transformaria o modelo em máquina de atribuir vaga a
 * quem já saiu da empresa.
 */
export function jobTemplateContentFrom(
	job: Record<string, unknown>,
): JobTemplateContent {
	const content: Record<string, unknown> = {}
	for (const field of JOB_TEMPLATE_CONTENT_FIELDS) {
		const value = job[field]
		if (value !== undefined && value !== null && value !== '') {
			content[field] = value
		}
	}
	return content as JobTemplateContent
}
