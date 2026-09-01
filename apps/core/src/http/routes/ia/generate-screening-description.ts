import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { BadRequestError } from '@coploy/shared/errors'
import { recordCoreAiUsage, usageFromOpenAiResponse } from '@/lib/ai-usage'

function buildScreeningDescriptionPrompt(input: {
	cargo: string
	cidade: string
	estado: string
	pais: string
	tipo_contratacao: string
	modalidade_trabalho: string
	objetivo_triagem: string
	idioma: string
	habilidades_principais?: string
	idade_minima?: number
	experiencia_previa?: string
}): string {
	return `Você é um especialista em recrutamento e triagem de candidatos. Crie uma descrição objetiva para uma entrevista de triagem via WhatsApp para a vaga de ${input.cargo}.

## CONTEXTO:
Esta é uma entrevista de PRÉ-SELEÇÃO (não técnica) que visa filtrar candidatos antes da entrevista técnica. A descrição será utilizada como base para gerar perguntas de triagem através de inteligência artificial.

## INFORMAÇÕES DA VAGA:
- **Cargo**: ${input.cargo}
- **Localização**: ${input.cidade},${input.estado},${input.pais}
- **Tipo de Contratação**: ${input.tipo_contratacao}
- **Modalidade**: ${input.modalidade_trabalho}
- **Objetivo da Triagem**: ${input.objetivo_triagem}
**Habilidades Desejadas**: ${input.habilidades_principais ?? 'Não informadas'}
**Idade Mínima**: ${input.idade_minima ?? 0}
**Requer Experiência Prévia**: ${input.experiencia_previa ?? 'Não informado'}

## DIRETRIZES:
1. Foque em aspectos comportamentais, motivacionais e de fit cultural (não em habilidades técnicas profundas)
2. A descrição deve ser clara, objetiva e adequada para uma triagem rápida via WhatsApp
3. Considere o objetivo da triagem informado: ${input.objetivo_triagem}
4. Mencione os diferenciais e o que se espera do candidato em termos de perfil e atitude
5. Use linguagem acessível e direta
6. Escreva em formato de texto corrido (parágrafos), não em listas

## IDIOMA:
Gere todo o texto em: ${input.idioma}

## FORMATO DA RESPOSTA (JSON):
{
  "descricao": "(texto corrido descrevendo o propósito da triagem, o perfil desejado, contexto da vaga e o que será avaliado nesta etapa inicial)"
}`
}

export function generateScreeningDescription(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/ia/screening-description',
			{
				config: {
					rateLimit: rateLimitConfigs.ia,
				},
				schema: {
					'x-surface': 'empresa',
					tags: ['ia'],
					security: [{ bearerAuth: [] }],
					summary:
						'Gera descrição de triagem de candidatos baseada nos dados da vaga',
					body: z.object({
						cargo: z.string({
							required_error: 'Cargo é obrigatório',
						}),
						estado: z.string({
							required_error: 'Estado é obrigatório',
						}),
						idioma: z.string({
							required_error: 'Idioma é obrigatório',
						}),
						pais: z.string({
							required_error: 'País é obrigatório',
						}),
						cidade: z.string({
							required_error: 'Cidade é obrigatória',
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
						habilidades_principais: z.string().optional(),
						idade_minima: z.number().default(0),
						experiencia_previa: z.string().optional(),
					}),
					response: {
						200: z.object({
							descricao: z.string(),
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

				const systemPrompt = buildScreeningDescriptionPrompt(request.body)

				const response = await axios.post(
					'https://api.openai.com/v1/chat/completions',
					{
						model: 'gpt-4o',
						messages: [{ role: 'system', content: systemPrompt }],
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: 'screening_description',
								strict: true,
								schema: {
									type: 'object',
									properties: {
										descricao: { type: 'string' },
									},
									required: ['descricao'],
									additionalProperties: false,
								},
							},
						},
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

				const parsed = JSON.parse(content) as { descricao: string }
				if (!parsed.descricao) {
					throw new BadRequestError(
						'Resposta da OpenAI em formato inválido',
					)
				}

				const usage = usageFromOpenAiResponse(response)
				recordCoreAiUsage({
					infra: app.infra,
					company: membership.company,
					userId,
					requestId: request.id,
					surface: 'screening_description',
					model: usage.model,
					provider: usage.provider,
					usage: usage.usage,
					metadata: {
						cargo: request.body.cargo,
						idioma: request.body.idioma,
					},
				})

				return { descricao: parsed.descricao }
			},
		)
}
