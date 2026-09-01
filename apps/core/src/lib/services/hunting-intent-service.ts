import axios from 'axios'

import type { Company } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { env } from '@/env'
import { recordCoreAiUsage, usageFromOpenAiResponse } from '@/lib/ai-usage'

/**
 * Busca no banco de talentos, em português.
 *
 * ## O problema
 *
 * `GET /public_interviews` aceita 19 filtros — nível de senioridade com
 * confiança, skill com pontuação e nível de evidência, porte de empresa ideal,
 * nota mínima. A tela expõe seis. Os outros treze existem, ninguém alcança, e
 * quem precisa deles teria de conhecer o nome de cada parâmetro.
 *
 * ## A escolha
 *
 * O assistente NÃO busca: ele traduz. Recebe "preciso de alguém de suporte
 * pleno, remoto, que já tenha lidado com cliente irritado" e devolve os filtros
 * correspondentes. A busca continua sendo a mesma consulta de sempre.
 *
 * Isso importa por dois motivos. O resultado fica auditável — a tela mostra os
 * filtros interpretados como chips editáveis, então a pessoa vê o que foi
 * entendido e corrige, em vez de receber uma lista mágica. E o custo é uma
 * chamada curta por busca, não um modelo lendo currículos.
 *
 * ## O que ele NÃO faz
 *
 * Não inventa filtro que a API não tem, não promete base de milhões de perfis
 * (a nossa é de quem fez entrevista aqui — menor e com evidência), e quando a
 * descrição é vaga demais devolve UMA pergunta em vez de chutar.
 */
const MODEL = 'gpt-4o-mini'

const SYSTEM = `Você traduz pedidos de recrutadores em filtros de busca de talentos.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{"criteria":{...},"refine":null|"...","summary":"..."}

Campos permitidos em "criteria" (omita o que não foi pedido):
- find: string (cargo, área ou termo livre)
- careerLevel: "estagio"|"junior"|"pleno"|"senior"|"especialista"|"lideranca"
- senioridadeNivel: mesma lista (senioridade AFERIDA na entrevista)
- country, state, city: string
- hardSkillTag: string (uma skill técnica)
- minHardSkillPontuacao: número 0-10
- minScoreGeral: número 0-10
- minYearsExperience: número (anos de experiência declarados no currículo)
- porteEmpresa: "startup"|"media"|"grande"
- tipoEmpresaIdeal: string

REGRA PRINCIPAL: sempre devolva "criteria" com algum critério útil. Buscar de
menos é melhor que não buscar: o recrutador vê a lista e refina, enquanto uma
tela vazia com uma pergunta parece que o produto travou.

SOBRE O "find": ele é comparado palavra por palavra contra cargo, currículo,
formação, skills e o resumo da entrevista do candidato. Então:
- Coloque nele só as palavras que DESCREVEM a pessoa: cargo, tecnologia,
  característica ("proativo", "liderança", "atendimento").
- NUNCA inclua palavra vazia como "profissional", "pessoa", "alguém",
  "candidato", "gente", "preciso", "quero" — elas aparecem em tudo ou em nada
  e só atrapalham.
- Se não sobrar palavra útil, omita "find" e use os outros filtros.

Outras regras:
- Prefira POUCOS filtros. Cada filtro extra corta a lista, e a base é de pessoas
  que fizeram entrevista aqui — não é um índice de milhões de perfis.
- Nunca invente campo fora da lista.
- Só use nota mínima se a pessoa pedir qualidade explicitamente ("bons",
  "melhores", "nota acima de X").
- Se a pessoa disser "qualquer nível", NÃO filtre por nível.
- Tempo de experiência ("mais de 15 anos", "sênior com 10+") vira
  "minYearsExperience": o número, direto. NÃO traduza para nível — o campo
  existe e é exato; converter em senioridade perderia o que a pessoa pediu.
- "refine": uma sugestão OPCIONAL de refinamento, no formato de pergunta curta,
  ou null. Ela nunca substitui a busca — os resultados aparecem de qualquer
  jeito. Deixe null quando o pedido já for específico o bastante.
- "summary": uma frase curta dizendo o que você entendeu.`


export interface HuntingIntent {
	criteria: Record<string, string | number>
	/**
	 * Sugestão de refinamento — NUNCA um bloqueio.
	 *
	 * A primeira versão devolvia `question` e a tela não aplicava filtro nenhum
	 * enquanto houvesse pergunta. O resultado: o recrutador escrevia "quero
	 * pessoas de design, qualquer nível", recebia "que tipo de design?" e uma
	 * tela vazia. Perguntar e não entregar nada não parece inteligente, parece
	 * travado — e a comparação com quem entrega shortlist na hora é imediata.
	 */
	refine: string | null
	summary: string
}

export function createHuntingIntentService(infra: InfraProvider) {
	return {
		async interpret(params: {
			company: Company & { id: string }
			userId?: string | null
			text: string
		}): Promise<HuntingIntent> {
			const response = await axios.post(
				'https://api.openai.com/v1/chat/completions',
				{
					model: MODEL,
					temperature: 0,
					response_format: { type: 'json_object' },
					messages: [
						{ role: 'system', content: SYSTEM },
						{ role: 'user', content: params.text },
					],
				},
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${env.OPENAI_API_KEY}`,
					},
					timeout: 20_000,
				},
			)

			// custo registrado como qualquer outro uso de IA: sem isso o /admin
			// mostraria uma linha de gasto que ninguém sabe de onde vem
			const usage = usageFromOpenAiResponse(response)
			recordCoreAiUsage({
				infra,
				company: params.company,
				userId: params.userId,
				surface: 'hunting_intent',
				...usage,
			})

			const raw = response.data?.choices?.[0]?.message?.content ?? '{}'
			const parsed = JSON.parse(raw) as Partial<HuntingIntent>

			const criteria = sanitize(parsed.criteria)

			return {
				/*
				 * Rede de segurança: se o modelo devolver criteria vazio apesar da
				 * instrução, o texto do usuário vira o termo de busca. Melhor uma
				 * busca ampla do que nenhuma.
				 */
				criteria: Object.keys(criteria).length > 0 ? criteria : { find: params.text.slice(0, 60) },
				refine:
					typeof parsed.refine === 'string' && parsed.refine.trim()
						? parsed.refine.trim()
						: null,
				summary: typeof parsed.summary === 'string' ? parsed.summary : '',
			}
		},
	}
}

const ALLOWED = new Set([
	'find',
	'careerLevel',
	'senioridadeNivel',
	'country',
	'state',
	'city',
	'hardSkillTag',
	'minHardSkillPontuacao',
	'minScoreGeral',
	'minYearsExperience',
	'porteEmpresa',
	'tipoEmpresaIdeal',
])

/**
 * Filtro que a API não conhece vira 400 na busca seguinte — e o usuário veria
 * um erro sem entender que a culpa foi da interpretação. Descartar aqui é mais
 * honesto que confiar no modelo ter obedecido.
 */
function sanitize(criteria: unknown): Record<string, string | number> {
	if (!criteria || typeof criteria !== 'object') return {}
	const clean: Record<string, string | number> = {}
	for (const [key, value] of Object.entries(criteria as Record<string, unknown>)) {
		if (!ALLOWED.has(key)) continue
		if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
		else if (typeof value === 'string' && value.trim()) clean[key] = value.trim()
	}
	return clean
}
