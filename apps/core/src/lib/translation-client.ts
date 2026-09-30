import axios from 'axios'

import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'

export type TranslationUsage = {
	promptTokens?: number | null
	cachedPromptTokens?: number | null
	completionTokens?: number | null
	totalTokens?: number | null
}

export type TranslationResponse<T> = {
	translated: T
	model?: string
	provider?: 'openai'
	usage?: TranslationUsage
}

type OpenAiChatResponse = {
	model?: string
	usage?: {
		prompt_tokens?: number
		prompt_tokens_details?: { cached_tokens?: number }
		completion_tokens?: number
		total_tokens?: number
	}
	choices?: Array<{
		message?: {
			content?: string | null
		}
	}>
}

export async function translateJson<T>(input: {
	payload: T
	targetLanguage: string
	sourceLanguage?: string | null
	instructions?: string
}): Promise<TranslationResponse<T>> {
	if (!env.OPENAI_API_KEY) {
		throw new BadRequestError('OPENAI_API_KEY ausente para tradução')
	}

	const response = await axios.post<OpenAiChatResponse>(
		'https://api.openai.com/v1/chat/completions',
		{
			model: 'gpt-4o-mini',
			temperature: 0.1,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content: [
						'You translate JSON values for a recruiting interview product.',
						'Return only valid JSON in the exact shape { "payload": <translated payload> }.',
						'Translate only human-readable prose string values.',
						'Preserve JSON keys, object shape, array order, numbers, booleans, nulls, IDs, URLs, timestamps, and technical codes exactly.',
						input.instructions ?? '',
					].filter(Boolean).join(' '),
				},
				{
					role: 'user',
					content: JSON.stringify({
						targetLanguage: input.targetLanguage,
						sourceLanguage: input.sourceLanguage ?? null,
						payload: input.payload,
					}),
				},
			],
		},
		{
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			timeout: 120_000,
		},
	)

	const content = response.data.choices?.[0]?.message?.content
	if (!content) {
		throw new BadRequestError('Resposta da OpenAI sem conteúdo')
	}

	let parsed: { payload?: T; translated?: T }
	try {
		parsed = JSON.parse(content) as { payload?: T; translated?: T }
	} catch {
		throw new BadRequestError('Resposta da OpenAI não é JSON válido')
	}

	const translated = parsed.payload ?? parsed.translated
	if (translated === undefined || translated === null) {
		throw new BadRequestError('Resposta de tradução sem payload')
	}

	const rawUsage = response.data.usage
	return {
		translated,
		model: response.data.model ?? 'gpt-4o-mini',
		provider: 'openai',
		usage: rawUsage
			? {
					promptTokens: rawUsage.prompt_tokens ?? null,
					cachedPromptTokens: rawUsage.prompt_tokens_details?.cached_tokens ?? null,
					completionTokens: rawUsage.completion_tokens ?? null,
					totalTokens: rawUsage.total_tokens ?? null,
				}
			: undefined,
	}
}
