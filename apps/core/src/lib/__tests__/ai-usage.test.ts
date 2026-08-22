import { estimateAiUsageMicroUsd, usageFromOpenAiResponse } from '@/lib/ai-usage'

describe('estimateAiUsageMicroUsd', () => {
	it('matches legacy pricing when cachedPromptTokens is 0', () => {
		const withExplicitZero = estimateAiUsageMicroUsd('gpt-4o-mini', 1_000_000, 500_000, 0)
		const omitted = estimateAiUsageMicroUsd('gpt-4o-mini', 1_000_000, 500_000)
		expect(withExplicitZero).toBe(omitted)
		expect(withExplicitZero).toBe(
			Math.round(((1_000_000 / 1_000_000) * 0.15 + (500_000 / 1_000_000) * 0.6) * 1_000_000),
		)
	})

	it('charges cachedInput rate when all prompt tokens are cached', () => {
		const micro = estimateAiUsageMicroUsd('gpt-4o-mini', 1_000_000, 0, 1_000_000)
		expect(micro).toBe(Math.round(((1_000_000 / 1_000_000) * 0.075) * 1_000_000))
	})

	it('splits 50/50 between input and cachedInput pricing', () => {
		const micro = estimateAiUsageMicroUsd('gpt-4o-mini', 1_000_000, 0, 500_000)
		const expectedUsd = (500_000 / 1_000_000) * 0.15 + (500_000 / 1_000_000) * 0.075
		expect(micro).toBe(Math.round(expectedUsd * 1_000_000))
	})

	it('clamps cached tokens above promptTokens', () => {
		const micro = estimateAiUsageMicroUsd('gpt-4o-mini', 100, 0, 9999)
		expect(micro).toBe(Math.round(((100 / 1_000_000) * 0.075) * 1_000_000))
	})

	it('uses cachedInput equal to input for minimax models', () => {
		const a = estimateAiUsageMicroUsd('minimax-m2.7', 1_000_000, 0, 500_000)
		const b = estimateAiUsageMicroUsd('minimax-m2.7', 1_000_000, 0, 0)
		expect(a).toBe(b)
	})
})

describe('usageFromOpenAiResponse', () => {
	it('reads cached_tokens from prompt_tokens_details', () => {
		const out = usageFromOpenAiResponse({
			data: {
				model: 'gpt-4o-mini',
				usage: {
					prompt_tokens: 5000,
					prompt_tokens_details: { cached_tokens: 4500 },
					completion_tokens: 800,
					total_tokens: 5800,
				},
			},
		})
		expect(out.model).toBe('gpt-4o-mini')
		expect(out.provider).toBe('openai')
		expect(out.usage?.cachedPromptTokens).toBe(4500)
		expect(out.usage?.promptTokens).toBe(5000)
	})

	it('sets cachedPromptTokens null when prompt_tokens_details is absent', () => {
		const out = usageFromOpenAiResponse({
			data: {
				model: 'gpt-4o',
				usage: {
					prompt_tokens: 100,
					completion_tokens: 20,
					total_tokens: 120,
				},
			},
		})
		expect(out.usage?.cachedPromptTokens).toBeNull()
	})
})
