/**
 * As listas de opções da vaga — as MESMAS da v1.
 *
 * O v2 tinha inventado as próprias (6 níveis contra 22, 20 categorias contra
 * 57, escolaridades que não existem na base) e guardava SLUG onde a v1 guarda
 * RÓTULO. As duas coisas juntas produziam o pior tipo de defeito: uma vaga de
 * "Coordenador" criada na v1 abria no v2 sem nível — ou, pior, caía na PRIMEIRA
 * opção e salvava "Estágio" sem ninguém ter digitado nada.
 *
 * Por isso o valor canônico aqui é o RÓTULO em pt-BR: é o que a base já tem e o
 * que a v1 renderiza. `alias` cobre a leitura do que já foi gravado — o slug em
 * inglês da v1 (o formulário em inglês guarda `intern`, não `Estagiário`) e os
 * slugs que o v2 chegou a gravar.
 *
 * Gerado a partir de `web/dashboard/public/locales/{pt,en}/createJob.json`.
 */

export interface JobOption {
	value: string
	en: string
	alias?: string[]
}

export const LEVELS: JobOption[] = [
	{ value: 'Estagiário', en: 'Intern', alias: ['intern', 'estagio'] },
	{ value: 'Trainee', en: 'Trainee' },
	{ value: 'Júnior', en: 'Junior' },
	{ value: 'Assistente', en: 'Assistant', alias: ['assistant'] },
	{ value: 'Operacional', en: 'Operational', alias: ['operational'] },
	{ value: 'Associado', en: 'Associate', alias: ['associate'] },
	{ value: 'Técnico', en: 'Technician', alias: ['technician'] },
	{ value: 'Analista', en: 'Analyst', alias: ['analyst'] },
	{ value: 'Pleno', en: 'Mid-level' },
	{ value: 'Sênior', en: 'Senior' },
	{ value: 'Especialista', en: 'Specialist', alias: ['specialist'] },
	{ value: 'Consultor Sênior', en: 'Senior Consultant', alias: ['senior_consultant'] },
	{ value: 'Coordenador', en: 'Coordinator', alias: ['coordinator'] },
	{ value: 'Gerente', en: 'Manager', alias: ['manager', 'lideranca'] },
	{ value: 'Gerente de Projetos', en: 'Project Manager', alias: ['project_manager'] },
	{ value: 'Chefe', en: 'Chief', alias: ['chief'] },
	{ value: 'Diretor', en: 'Director', alias: ['director'] },
	{ value: 'Diretor de Operações (COO)', en: 'Chief Operating Officer (COO)', alias: ['operations_director'] },
	{ value: 'Diretor Financeiro (CFO)', en: 'Chief Financial Officer (CFO)', alias: ['finance_director'] },
	{ value: 'Diretor de Tecnologia (CTO)', en: 'Chief Technology Officer (CTO)', alias: ['chief_technology_officer'] },
	{ value: 'Diretor de Marketing (CMO)', en: 'Chief Marketing Officer (CMO)', alias: ['chief_marketing_officer'] },
	{ value: 'Diretor Executivo (CEO)', en: 'Chief Executive Officer (CEO)', alias: ['executive_director'] },
]

export const EDUCATION: JobOption[] = [
	{ value: 'Ensino Fundamental', en: 'Elementary School' },
	{ value: 'Ensino Médio (Cursando)', en: 'High School (In Progress)', alias: ['high_school_in_progress'] },
	{ value: 'Ensino Médio (Concluído)', en: 'High School (Completed)', alias: ['high_school_completed', 'Ensino Médio'] },
	{ value: 'Ensino Superior (Cursando)', en: 'Bachelor\'s Degree (In Progress)', alias: ['undergraduate_in_progress', 'Ensino Superior incompleto'] },
	{ value: 'Ensino Superior (Concluído)', en: 'Bachelor\'s Degree (Completed)', alias: ['undergraduate_completed', 'Ensino Superior completo'] },
	{ value: 'Pós Graduação (Cursando)', en: 'Postgraduate Diploma (In Progress)', alias: ['post_graduate_in_progress'] },
	{ value: 'Pós Graduação (Concluído)', en: 'Postgraduate Diploma (Completed)', alias: ['post_graduate_completed', 'Pós-graduação'] },
	{ value: 'Mestrado (Cursando)', en: 'Master\'s Degree (In Progress)', alias: ['master_in_progress'] },
	{ value: 'Mestrado (Concluído)', en: 'Master\'s Degree (Completed)', alias: ['master_completed', 'Mestrado'] },
	{ value: 'Doutorado (Cursando)', en: 'Doctorate (PhD) (In Progress)', alias: ['doctorate_in_progress'] },
	{ value: 'Doutorado (Concluído)', en: 'Doctorate (PhD) (Completed)', alias: ['doctorate_completed', 'Doutorado'] },
	{ value: 'Técnico (Cursando)', en: 'Technical Course (In Progress)', alias: ['technician_in_progress'] },
	{ value: 'Técnico (Concluído)', en: 'Technical Course (Completed)', alias: ['technician_completed', 'Ensino Técnico'] },
]

export const CONTRACTS: JobOption[] = [
	{ value: 'CLT', en: 'CLT', alias: ['clt'] },
	{ value: 'PJ', en: 'PJ', alias: ['pj'] },
	{ value: 'Estágio', en: 'Internship', alias: ['estagio'] },
	{ value: 'Temporário', en: 'Temporary', alias: ['temporario'] },
	{ value: 'Freelancer', en: 'Freelancer' },
	{ value: 'Aprendiz', en: 'Apprentice' },
]

export const MODELS: JobOption[] = [
	{ value: 'Presencial', en: 'On-site', alias: ['presencial', 'onsite'] },
	{ value: 'Híbrido', en: 'Hybrid', alias: ['hibrido', 'hybrid'] },
	{ value: 'Remoto', en: 'Remote', alias: ['remoto', 'remote'] },
]

/**
 * Categorias: união da lista da v1 com as que só o v2 tinha.
 *
 * A taxonomia da v1 é imperfeita (tem "Consultoria e Assessoramento" e
 * "Consultoria e Assessoria" nela), mas descartar entrada existente apagaria a
 * categoria de vaga já cadastrada. Sem tradução: a lista em inglês da v1 tem 22
 * itens contra 57, então não há de onde traduzir sem inventar.
 */
export const CATEGORIES: string[] = [
	'Administrativo',
	'Agricultura',
	'Agricultura e Agronegócios',
	'Agronegócio',
	'Alimentação (restaurantes, bares)',
	'Alimentação e Bebidas',
	'Alimentos e Bebidas',
	'Atendimento ao Cliente',
	'Auditoria contábil, fiscal ou financeira',
	'Automotivo e Fabricação',
	'Automotivo e Manufatura',
	'Bem-estar e Fitness',
	'Bem-Estar e Fitness',
	'Bens e Consumo',
	'Cibersegurança',
	'Ciência e Pesquisa',
	'Comercial / Vendas',
	'Comércio atacadista',
	'Comércio varejista',
	'Comunicação / Marketing',
	'Construção civil',
	'Construção Civil',
	'Construção e Engenharia Civil',
	'Consultoria e Assessoramento',
	'Consultoria e Assessoria',
	'Cuidado Pessoal (salões, spas)',
	'Cultura e Arte',
	'Dados / BI',
	'Design / Criação',
	'Educação',
	'Educação (escolas, universidades, cursos)',
	'Educação e Ensino',
	'Educação Superior e Pesquisa Científica',
	'Energia e Sustentabilidade',
	'Engenharia',
	'Finanças e Contabilidade',
	'Financeiro / Contábil',
	'Imobiliário',
	'Indústria Automotiva',
	'Indústria de Alimentos e Bebidas',
	'Indústria de Eletrônicos',
	'Indústria de Móveis',
	'Indústria Metalúrgica',
	'Indústria Química e Petroquímica',
	'Indústria Têxtil',
	'Jurídico',
	'Limpeza e Conservação',
	'Logística / Transporte',
	'Manutenção',
	'Marketing e Publicidade',
	'Mídia e Entretenimento',
	'Mineração',
	'Moda e Design',
	'ONGs e Associações',
	'Organizações Governamentais',
	'Produção / Operações',
	'Produto',
	'Publicidade e Marketing',
	'Recursos Humanos',
	'Saúde',
	'Saúde (hospitais, clínicas, laboratórios)',
	'Saúde e Cuidados Médicos',
	'Segurança do Trabalho',
	'Segurança Patrimonial',
	'Serviços Contábeis',
	'Serviços de Design e Inovação',
	'Serviços de Vigilância e Segurança Patrimonial',
	'Serviços Financeiros (bancos, corretoras)',
	'Serviços Gerais',
	'Serviços Governamentais',
	'Serviços Jurídicos',
	'Serviços Jurídicos Extendidos',
	'Silvicultura (florestas)',
	'Tecnologia da Informação',
	'Telecomunicações',
	'Transporte e Logística',
	'Turismo e Hospitalidade',
	'Turismo e Hotelaria',
	'Vendas e Atendimento ao Cliente',
]

function chave(bruto: string) {
	return bruto
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
}

/**
 * Resolve o que está gravado para uma opção da lista.
 *
 * Devolve `''` quando não reconhece — NUNCA a primeira opção. Cair na primeira
 * é o que fazia a vaga trocar de nível sozinha ao ser aberta para edição.
 */
export function resolverOpcao(bruto: unknown, lista: JobOption[]): string {
	if (typeof bruto !== 'string' || !bruto.trim()) return ''
	const alvo = chave(bruto)
	const achado = lista.find(
		(opcao) =>
			chave(opcao.value) === alvo ||
			chave(opcao.en) === alvo ||
			(opcao.alias ?? []).some((apelido) => chave(apelido) === alvo),
	)
	return achado?.value ?? ''
}

/** Categoria é lista de rótulos: casa por rótulo, sem apelido. */
export function resolverCategoria(bruto: unknown): string {
	if (typeof bruto !== 'string' || !bruto.trim()) return ''
	const alvo = chave(bruto)
	return CATEGORIES.find((item) => chave(item) === alvo) ?? ''
}

/** Rótulo na língua da interface. `en` só existe onde a v1 traduziu. */
export function rotulo(opcao: JobOption, idioma: string) {
	return idioma.startsWith('en') ? opcao.en : opcao.value
}

/** As opções prontas para os `select`, já no idioma da interface. */
export function opcoes(lista: JobOption[], idioma: string) {
	return lista.map((opcao) => ({ value: opcao.value, label: rotulo(opcao, idioma) }))
}

/**
 * Os níveis que o FILTRO de hunting aceita.
 *
 * Lista separada de propósito: quem manda aqui é o enum do core
 * (`interview-filters.ts::CareerLevel`), e ele diverge do formulário da v1 em
 * três entradas — "Gerente de Projeto" (a v1 grava no plural) e os dois
 * diretores que o core escreve em inglês. Mandar valor fora do enum faz a
 * requisição inteira falhar com 400, então o filtro precisa falar exatamente a
 * língua dele.
 *
 * O v2 mandava slug (`pleno`, `estagio`): nenhum deles está no enum, então
 * escolher um nível no hunting quebrava a busca em vez de filtrar.
 */
export const HUNTING_LEVELS: string[] = [
	'Estagiário',
	'Trainee',
	'Júnior',
	'Assistente',
	'Operacional',
	'Associado',
	'Técnico',
	'Analista',
	'Pleno',
	'Sênior',
	'Especialista',
	'Consultor Sênior',
	'Coordenador',
	'Gerente',
	'Gerente de Projeto',
	'Chefe',
	'Diretor',
	'Diretor de Operações (COO)',
	'Diretor Financeiro (CFO)',
	'Chief Technology Officer (CTO)',
	'Chief Marketing Officer (CMO)',
	'Diretor Executivo (CEO)',
]
