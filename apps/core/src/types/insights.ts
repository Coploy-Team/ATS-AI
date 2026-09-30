import type { SupportedLanguage } from '@/http/constants/insights-constants'

// Tipo para armazenar o insight no Firestore
export interface InsightCache {
	companyId: string
	language: SupportedLanguage
	insight: string
	generatedAt: Date
	sampleSizeInterviews?: number
	sampleSizeJobs?: number
}

// Dados agregados do dashboard para o prompt
export interface DashboardData {
	jobs: {
		total: number
		items: number
	}
	interviews: {
		total: number
		items: number
	}
	approved: {
		total: number
		items: number
	}
	approvalRate: string
}

// Dados para o prompt da OpenAI
export interface PromptData {
	interviewsByJob: Array<{ value: number }>
	interviewsByTime: unknown
	dashboard: DashboardData
}

// Parâmetros para geração de insights
export interface InsightGenerationParams {
	companyId: string
	language: SupportedLanguage
	authorization: string
	force?: boolean
}

// Resultado da geração de insights
export interface InsightResult {
	insight: string
	generatedAt: string
	language: SupportedLanguage
	sampleSize?: {
		interviews: number
		jobs: number
	}
}

// Dados necessários para geração (obtidos de endpoints internos)
export interface InsightSourceData {
	interviewsByJob: Array<{ value: number }>
	interviewsByTime: unknown
	homeData: {
		jobs: { total: number; items: unknown[] }
		interviews: { total: number; items: unknown[] }
		approved: { total: number; items: unknown[] }
	}
}

// Configurações do OpenAI para insights
export interface OpenAIInsightConfig {
	model?: string
	temperature?: number
	max_tokens?: number
	messages: Array<{
		role: 'system' | 'user'
		content: string
	}>
}
