import type { Occupation, Skill } from '@coploy/domain'

/**
 * Semente da taxonomia (V2-801).
 *
 * Recorte deliberado: as ocupações e skills que **aparecem na base atual**, não
 * as 2.600 famílias da CBO inteira. Carregar tudo antes de saber o que casa
 * daria um índice enorme para resolver os mesmos 40 cargos — e a carga completa
 * continua possível (o script aceita qualquer arquivo no mesmo formato).
 *
 * Os códigos são reais (CBO/MTE). Os sinônimos vieram do que o campo de cargo
 * recebe de verdade: abreviação, inglês, e a grafia que o candidato usa.
 */

export const TAXONOMY_VERSION = 'cbo-2002.seed-1'

function occupation(
	code: string,
	title: string,
	synonyms: string[],
	familyCode: string,
): Occupation {
	return {
		id: `cbo:${code}`,
		source: 'cbo',
		code,
		title,
		synonyms,
		familyCode,
		groupCode: familyCode.slice(0, 2),
		mappedTo: null,
		taxonomyVersion: TAXONOMY_VERSION,
		language: 'pt-BR',
	}
}

export const SEED_OCCUPATIONS: Occupation[] = [
	occupation(
		'2124-05',
		'Analista de desenvolvimento de sistemas',
		[
			'desenvolvedor de software',
			'desenvolvedor',
			'programador',
			'software engineer',
			'engenheiro de software',
			'dev',
		],
		'2124',
	),
	occupation(
		'2124-10',
		'Analista de suporte computacional',
		['analista de suporte', 'suporte tecnico', 'support analyst', 'analista de sustentacao'],
		'2124',
	),
	occupation(
		'2124-20',
		'Desenvolvedor front-end',
		['front end', 'frontend developer', 'desenvolvedor front end', 'dev front'],
		'2124',
	),
	occupation(
		'2124-25',
		'Desenvolvedor back-end',
		['back end', 'backend developer', 'desenvolvedor back end', 'dev back'],
		'2124',
	),
	occupation(
		'2124-30',
		'Desenvolvedor full stack',
		['full stack', 'fullstack developer', 'desenvolvedor fullstack', 'dev full stack'],
		'2124',
	),
	occupation(
		'2124-35',
		'Analista de qualidade de software',
		['qa', 'quality assurance', 'analista de testes', 'testador', 'qa engineer'],
		'2124',
	),
	occupation(
		'1425-05',
		'Gerente de produto',
		['product manager', 'pm', 'gerente de produtos', 'po', 'product owner'],
		'1425',
	),
	occupation(
		'2624-05',
		'Designer de produto digital',
		['product designer', 'designer ux', 'ux designer', 'ui designer', 'designer de interface'],
		'2624',
	),
	occupation(
		'2521-05',
		'Analista de recursos humanos',
		['analista de rh', 'analista de recursos humanos', 'hr analyst', 'analista de pessoas'],
		'2521',
	),
	occupation(
		'1423-05',
		'Gerente comercial',
		['gerente de vendas', 'sales manager', 'head comercial'],
		'1423',
	),
	occupation(
		'3541-05',
		'Vendedor',
		['comercial', 'vendedor interno', 'representante comercial', 'consultor de vendas'],
		'3541',
	),
	occupation(
		'4110-10',
		'Assistente administrativo',
		['auxiliar administrativo', 'assistente adm', 'administrativo'],
		'4110',
	),
	occupation(
		'5143-20',
		'Auxiliar de limpeza',
		['servicos gerais', 'auxiliar de servicos gerais', 'faxineiro', 'zelador'],
		'5143',
	),
	occupation(
		'5174-10',
		'Fiscal de transporte',
		['fiscal de onibus', 'fiscal de terminal', 'fiscal de transporte urbano'],
		'5174',
	),
	occupation(
		'2522-10',
		'Analista financeiro',
		['analista de financas', 'financial analyst', 'analista fiscal'],
		'2522',
	),
	occupation(
		'2611-05',
		'Analista de marketing',
		['marketing', 'analista de midias', 'marketing analyst'],
		'2611',
	),
	occupation(
		'2124-40',
		'Cientista de dados',
		['data scientist', 'analista de dados', 'data analyst', 'engenheiro de dados'],
		'2124',
	),
	occupation(
		'1421-05',
		'Gerente de tecnologia da informação',
		['gerente de ti', 'head de tecnologia', 'cto', 'tech lead', 'lider tecnico'],
		'1421',
	),
]

function skill(name: string, synonyms: string[], category: string): Skill {
	return {
		id: `skill:${name.toLowerCase().replace(/[^a-z0-9+#]+/g, '-')}`,
		name,
		synonyms,
		category,
		source: 'curated',
		taxonomyVersion: TAXONOMY_VERSION,
		pendingCuration: false,
		occurrences: 0,
	}
}

export const SEED_SKILLS: Skill[] = [
	skill('React', ['ReactJS', 'React.js', 'react js'], 'framework'),
	skill('Node.js', ['NodeJS', 'node', 'node js'], 'runtime'),
	skill('TypeScript', ['TS', 'type script'], 'linguagem'),
	skill('JavaScript', ['JS', 'ECMAScript', 'java script'], 'linguagem'),
	skill('Python', ['python3', 'py'], 'linguagem'),
	skill('Java', ['java se', 'java ee'], 'linguagem'),
	skill('Spring', ['Spring Boot', 'springboot'], 'framework'),
	skill('SQL', ['PostgreSQL', 'MySQL', 'postgres', 'banco de dados relacional'], 'dados'),
	skill('Docker', ['containers', 'conteineres'], 'infraestrutura'),
	skill('Kubernetes', ['k8s', 'kube'], 'infraestrutura'),
	skill('AWS', ['Amazon Web Services', 'amazon aws'], 'nuvem'),
	skill('GCP', ['Google Cloud', 'google cloud platform'], 'nuvem'),
	skill('Figma', ['figma design'], 'ferramenta'),
	skill('Excel', ['microsoft excel', 'planilhas', 'excel avancado'], 'ferramenta'),
	skill('Inglês', ['ingles', 'english', 'ingles avancado'], 'idioma'),
	skill('Espanhol', ['espanhol', 'spanish'], 'idioma'),
	skill('Comunicação', ['comunicacao', 'boa comunicacao', 'communication'], 'comportamental'),
	skill('Liderança', ['lideranca', 'leadership', 'gestao de equipe'], 'comportamental'),
	skill('Atendimento ao cliente', ['atendimento', 'customer service', 'suporte ao cliente'], 'comportamental'),
	skill('Vendas', ['sales', 'negociacao', 'prospeccao'], 'comercial'),
]
