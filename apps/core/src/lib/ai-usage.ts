import type { Company, AiUsageSurface } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

type TokenUsage = {
	promptTokens?: number | null
	cachedPromptTokens?: number | null
	completionTokens?: number | null
	totalTokens?: number | null
}

type AiProvider = 'openai' | 'minimax'

const MODEL_PRICES_PER_1M_TOKENS: Record<string, { input: number; output: number; cachedInput: number }> = {
	'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
	'gpt-4o': { input: 5, output: 15, cachedInput: 2.5 },
	'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.2 },
	'gpt-4.1': { input: 2, output: 8, cachedInput: 1 },
	'minimax-m2.7': { input: 0.3, output: 1.2, cachedInput: 0.3 },
	'minimax-m2.5': { input: 0.3, output: 1.2, cachedInput: 0.3 },
}

function priceForModel(model: string): { input: number; output: number; cachedInput: number } | undefined {
	const normalized = model.toLowerCase()
	return MODEL_PRICES_PER_1M_TOKENS[model] ??
		MODEL_PRICES_PER_1M_TOKENS[normalized] ??
		(normalized.startsWith('gpt-4o-mini') ? MODEL_PRICES_PER_1M_TOKENS['gpt-4o-mini'] : undefined) ??
		(normalized.startsWith('gpt-4o') ? MODEL_PRICES_PER_1M_TOKENS['gpt-4o'] : undefined) ??
		(normalized.startsWith('gpt-4.1-mini') ? MODEL_PRICES_PER_1M_TOKENS['gpt-4.1-mini'] : undefined) ??
		(normalized.startsWith('gpt-4.1') ? MODEL_PRICES_PER_1M_TOKENS['gpt-4.1'] : undefined) ??
		(normalized.startsWith('minimax-m2.7') ? MODEL_PRICES_PER_1M_TOKENS['minimax-m2.7'] : undefined) ??
		(normalized.startsWith('minimax-m2.5') ? MODEL_PRICES_PER_1M_TOKENS['minimax-m2.5'] : undefined)
}

function inferProvider(model: string): AiProvider {
	return model.toLowerCase().includes('minimax') ? 'minimax' : 'openai'
}

export function estimateAiUsageMicroUsd(
	model: string,
	promptTokens?: number | null,
	completionTokens?: number | null,
	cachedPromptTokens?: number | null,
): number | null {
	const price = priceForModel(model)
	if (!price) return null
	const cached = Math.max(0, Math.min(cachedPromptTokens ?? 0, promptTokens ?? 0))
	const uncached = Math.max(0, (promptTokens ?? 0) - cached)
	const costUsd =
		(uncached / 1_000_000) * price.input +
		(cached / 1_000_000) * price.cachedInput +
		((completionTokens ?? 0) / 1_000_000) * price.output
	return Math.round(costUsd * 1_000_000)
}

export function recordCoreAiUsage(input: {
	infra: InfraProvider
	company: Company & { id: string }
	userId?: string | null
	requestId?: string | null
	surface: AiUsageSurface
	model?: string | null
	provider?: AiProvider | null
	usage?: TokenUsage | null
	postJobId?: string | null
	jobAppliedId?: string | null
	metadata?: Record<string, unknown> | null
}) {
	const { infra, company, usage, model } = input
	if (!model || !usage) return
	const now = new Date()
	const iso = now.toISOString()
	const promptTokens = usage.promptTokens ?? null
	const cachedPromptTokens = usage.cachedPromptTokens ?? null
	const completionTokens = usage.completionTokens ?? null

	infra.aiUsageRepository
		.create({
			companyId: company.id,
			companyName:
				typeof company.companyName === 'string' ? company.companyName : null,
			occurredAt: iso,
			occurredDate: iso.slice(0, 10),
			occurredMonth: iso.slice(0, 7),
			source: 'core',
			surface: input.surface,
			provider: input.provider ?? inferProvider(model),
			model,
			promptTokens,
			cachedPromptTokens,
			completionTokens,
			totalTokens: usage.totalTokens ?? null,
			estimatedCostMicroUsd: estimateAiUsageMicroUsd(
				model,
				promptTokens,
				completionTokens,
				cachedPromptTokens,
			),
			requestId: input.requestId ?? null,
			postJobId: input.postJobId ?? null,
			jobAppliedId: input.jobAppliedId ?? null,
			userId: input.userId ?? null,
			metadata: input.metadata ?? null,
		})
		.catch((err) => console.warn('[AiUsage] failed to record core usage:', err))
}

export function usageFromOpenAiResponse(response: {
	data?: {
		model?: string
		usage?: {
			prompt_tokens?: number
			prompt_tokens_details?: { cached_tokens?: number }
			completion_tokens?: number
			total_tokens?: number
		}
	}
}): { model?: string; provider?: AiProvider; usage?: TokenUsage } {
	const raw = response.data?.usage
	if (!raw) return { model: response.data?.model }
	return {
		model: response.data?.model,
		provider: response.data?.model ? inferProvider(response.data.model) : undefined,
		usage: {
			promptTokens: raw.prompt_tokens ?? null,
			cachedPromptTokens: raw.prompt_tokens_details?.cached_tokens ?? null,
			completionTokens: raw.completion_tokens ?? null,
			totalTokens: raw.total_tokens ?? null,
		},
	}
}
