export interface WebhookDeliveryLog {
	id: string
	webhookId: string
	companyId: string
	event: string
	url: string
	method: string
	requestHeaders?: Record<string, string> | null
	requestBody?: Record<string, unknown> | null
	statusCode?: number | null
	responseBody?: string | null
	success: boolean
	errorMessage?: string | null
	durationMs?: number | null
	createdAt?: string | null
}
