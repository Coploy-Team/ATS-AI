import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { BadRequestError } from '@coploy/shared/errors'
import { recordCoreAiUsage, usageFromOpenAiResponse } from '@/lib/ai-usage'

function buildScreeningQuestionsPrompt(input: {
	cargo: string
	cidade: string
	descricao: string
	estado: string
	pais: string
	tipo_contratacao: string
	modalidade_trabalho: string
	objetivo_triagem: string
	numero: number
	idioma: string
	habilidades_principais?: string
	idade_minima?: number
	experiencia_previa?: string
}): string {
	return `Você é um especialista em triagem de candidatos. Gere perguntas ELIMINATÓRIAS para filtrar rapidamente candidatos via WhatsApp, usando APENAS as informações fornecidas no contexto.

# CONTEXTO DA VAGA
Cargo: ${input.cargo}
Localização: ${input.cidade},${input.estado}.${input.pais}
Tipo de Contratação: ${input.tipo_contratacao}
Modalidade: ${input.modalidade_trabalho}
Idade Mínima: ${input.idade_minima ?? 0}
Exige Experiência: ${input.experiencia_previa ?? 'Não informado'}
Habilidades Esperadas: ${input.habilidades_principais ?? 'Não informadas'}

Descrição:
${input.descricao}

# PERGUNTAS OBRIGATÓRIAS (JÁ DEFINIDAS - NÃO GERAR):
1. Qual a sua idade?
2. Qual o seu endereço completo?
3. Você tem experiência prévia como ${input.cargo}

# GERAR ${input.numero} PERGUNTAS ELIMINATÓRIAS

## OBJETIVO:
Criar perguntas diretas e objetivas que permitam ELIMINAR rapidamente candidatos que não atendem aos requisitos mínimos informados. Estas perguntas devem ter respostas claras (sim/não, valores específicos, disponibilidade).

## REGRAS ABSOLUTAS:
🚨 **NUNCA invente requisitos que não foram informados**
🚨 **NÃO pergunte sobre CNH, certificados ou documentos não mencionados**
🚨 **NÃO crie horários específicos se não foram fornecidos**
🚨 **NÃO invente habilidades além das listadas em "habilidades_principais"**
🚨 **USE APENAS as informações do contexto fornecido**

## CATEGORIAS DE PERGUNTAS (baseadas no que FOI informado):

### 1. LOCALIZAÇÃO E DESLOCAMENTO (se modalidade = Presencial ou Híbrido)
- Consegue trabalhar em ${input.cidade}, ${input.estado}?
- Quanto tempo de deslocamento até ${input.cidade}?
- Precisa se mudar ou já mora na região?
- Tem facilidade de locomoção até ${input.cidade}?

### 2. MODALIDADE DE TRABALHO
- Se Presencial: Você tem disponibilidade para trabalhar presencialmente em ${input.cidade}?
- Se Híbrido: Você consegue alternar entre trabalho presencial em ${input.cidade} e remoto?
- Se Remoto: Você tem estrutura adequada para trabalho remoto (internet, espaço)?

### 3. TIPO DE CONTRATAÇÃO
- Você aceita o regime de contratação ${input.tipo_contratacao}?
- (Se o país/contexto permitir) Qual sua pretensão salarial para ${input.tipo_contratacao}

### 4. HABILIDADES INFORMADAS (se habilidades_principais não for vazio)
Para cada habilidade listada, perguntar diretamente:
- Você tem/conhece [habilidade específica mencionada]?
- Qual seu nível de conhecimento em [habilidade mencionada]?

### 5. DISPONIBILIDADE GERAL
- Você tem disponibilidade para início imediato?
- Está cumprindo aviso prévio em outro emprego?
- Tem algum impedimento pessoal que limite sua disponibilidade para trabalhar como ${input.cargo}?

### 6. EXPECTATIVAS
- Qual sua expectativa salarial para a posição de ${input.cargo} em ${input.cidade}?
- Você tem outras propostas em andamento ou está focado nesta oportunidade?

## DIRETRIZES DE QUALIDADE:
✅ Perguntas diretas com respostas objetivas
✅ Foque em requisitos ELIMINATÓRIOS (se responder "não", elimina)
✅ Use o contexto real da vaga (cargo, cidade, modalidade)
✅ Máximo 150 caracteres por pergunta
✅ Linguagem simples e universal (funciona em qualquer país)

❌ NÃO invente requisitos não informados
❌ NÃO pergunte sobre competências comportamentais
❌ NÃO crie cenários hipotéticos
❌ NÃO use jargões específicos de um país

# IMPORTANTE:
- Idioma: ${input.idioma}
- Máximo 150 caracteres
- Gere exatamente ${input.numero} perguntas
- Use APENAS informações fornecidas no contexto
- Sem comentários ou metadados

# FORMATO DA SAÍDA:
{
  "Pergunta 1": "texto da pergunta",
  "Pergunta 2": "texto da pergunta",
  ...
  "Pergunta N": "texto da pergunta"
}`
}

function extrairPerguntas(response: Record<string, string>): string[] {
	const perguntasArray: string[] = []

	for (const key in response) {
		if (key.toLowerCase().includes('pergunta')) {
			perguntasArray.push(response[key])
		}
	}

	if (perguntasArray.length === 0) {
		for (const value of Object.values(response)) {
			if (typeof value === 'string' && value.trim()) {
				perguntasArray.push(value)
			}
		}
	}

	return perguntasArray
}

export function generateScreeningQuestions(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/ia/screening-questions',
			{
				config: {
					rateLimit: rateLimitConfigs.ia,
				},
				schema: {
					'x-surface': 'empresa',
					tags: ['ia'],
					security: [{ bearerAuth: [] }],
					summary:
						'Gera perguntas de triagem de candidatos baseadas nos dados da vaga',
					body: z.object({
						cargo: z.string({
							required_error: 'Cargo é obrigatório',
						}),
						cidade: z.string({
							required_error: 'Cidade é obrigatória',
						}),
						descricao: z.string({
							required_error: 'Descrição é obrigatória',
						}),
						estado: z.string({
							required_error: 'Estado é obrigatório',
						}),
						pais: z.string({
							required_error: 'País é obrigatório',
						}),
						tipo_contratacao: z.string({
							required_error: 'Tipo de contratação é obrigatório',
						}),
						modalidade_trabalho: z.string({
							required_error: 'Modalidade de trabalho é obrigatória',
						}),
						objetivo_triagem: z.string({
							required_error: 'Objetivo da triagem é obrigatório',
						}),
						numero: z.number({
							required_error: 'Número de perguntas é obrigatório',
						}),
						idioma: z.string({
							required_error: 'Idioma é obrigatório',
						}),
						habilidades_principais: z.string().optional(),
						idade_minima: z.number().default(0),
						experiencia_previa: z.string().optional(),
					}),
					response: {
						200: z.object({
							perguntas: z.array(z.string()),
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const membership = await request.getUserMembership()

				const systemPrompt = buildScreeningQuestionsPrompt(request.body)

				const response = await axios.post(
					'https://api.openai.com/v1/chat/completions',
					{
						model: 'gpt-4o-mini',
						messages: [{ role: 'system', content: systemPrompt }],
						response_format: { type: 'json_object' },
						temperature: 0.5,
					},
					{
						headers: {
							Authorization: `Bearer ${env.OPENAI_API_KEY}`,
							'Content-Type': 'application/json',
						},
						timeout: 120_000,
					},
				)

				const content = response.data?.choices?.[0]?.message?.content
				if (!content) {
					throw new BadRequestError(
						'Resposta da OpenAI sem conteúdo',
					)
				}

				const parsed = JSON.parse(content) as Record<string, string>
				const perguntasArray = extrairPerguntas(parsed)

				if (!perguntasArray.length) {
					throw new BadRequestError('Nenhuma pergunta foi gerada')
				}

				const usage = usageFromOpenAiResponse(response)
				recordCoreAiUsage({
					infra: app.infra,
					company: membership.company,
					userId,
					requestId: request.id,
					surface: 'screening_questions',
					model: usage.model,
					provider: usage.provider,
					usage: usage.usage,
					metadata: {
						cargo: request.body.cargo,
						idioma: request.body.idioma,
						questionCount: perguntasArray.length,
					},
				})

				return { perguntas: perguntasArray }
			},
		)
}
