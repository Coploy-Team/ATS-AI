import type { InfraProvider } from '@coploy/infra'
import type { ResultWebhook, WebhookDeliveryLog } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'
import { env } from '@/env'
import { eventCatalog } from '@/lib/events/event-catalog'

/** Tipos assináveis: o catálogo de domain events + o evento de resultado legado. */
const SUBSCRIBABLE_EVENTS = new Set([...Object.keys(eventCatalog), 'interview.finished'])

/**
 * Evento fora do catálogo é erro de digitação — e um webhook que assina
 * `candidatura.movida` (nome inexistente) fica em silêncio para sempre sem
 * ninguém entender por quê. Melhor recusar na hora do cadastro.
 */
function assertKnownEvents(events?: string[] | null) {
	if (!events) return
	const unknown = events.filter((event) => !SUBSCRIBABLE_EVENTS.has(event))
	if (unknown.length > 0) {
		throw new BadRequestError(`Evento desconhecido: ${unknown.join(', ')}`)
	}
}

export function createResultWebhookService(infra: InfraProvider) {
	async function assertOwnership(companyId: string, id: string) {
		const webhook = await infra.resultWebhookRepository.getById(id)
		if (!webhook || webhook.companyId !== companyId) {
			throw new NotFoundError('Webhook not found')
		}
	}

	return {
		async listWebhooks(companyId: string): Promise<ResultWebhook[]> {
			return infra.resultWebhookRepository.listByCompany(companyId)
		},

		/**
		 * `companyId` obrigatório: o webhook guarda URL e headers (que costumam
		 * carregar segredo do cliente), e buscar só por id deixava vazar entre
		 * tenants. Recurso de outra empresa responde como inexistente.
		 */
		async getWebhook(companyId: string, id: string): Promise<ResultWebhook | null> {
			const webhook = await infra.resultWebhookRepository.getById(id)
			if (!webhook || webhook.companyId !== companyId) return null
			return webhook
		},

		async createWebhook(
			companyId: string,
			data: Omit<Partial<ResultWebhook>, 'id' | 'companyId'> & { name: string; url: string },
		): Promise<ResultWebhook & { id: string }> {
			assertKnownEvents(data.events)
			return infra.resultWebhookRepository.create({
				...data,
				companyId,
				method: data.method ?? 'POST',
				approvalThreshold: data.approvalThreshold ?? 7,
				onlyOnApproval: data.onlyOnApproval ?? false,
				enabled: data.enabled ?? true,
			})
		},

		async updateWebhook(
			companyId: string,
			id: string,
			data: Omit<Partial<ResultWebhook>, 'id' | 'companyId'>,
		): Promise<void> {
			assertKnownEvents(data.events)
			await assertOwnership(companyId, id)
			await infra.resultWebhookRepository.update(id, data)
		},

		async deleteWebhook(companyId: string, id: string): Promise<void> {
			await assertOwnership(companyId, id)
			await infra.resultWebhookRepository.delete(id)
		},

		async testWebhook(params: {
			url: string
			method: 'POST' | 'PATCH' | 'PUT'
			headers?: Record<string, string> | null
		}): Promise<{ success: boolean; statusCode?: number; message: string }> {
			const jobId = 'desenvolvedor-frontend'
			const companyId = 'company_789'
			const interviewId = 'test-interview-id'
			const userId = 'test-user-id'
			const candidateFeedback =
				'Você se comunicou com clareza e demonstrou bons fundamentos de frontend.'
			const companyFeedback =
				'O candidato demonstra sólida experiência com React e visão clara de produto.'

			const testPayload = {
				event: 'interview.finished',
				interviewId,
				jobId,
				companyId,
				candidateEmail: 'candidato.teste@example.com',
				candidateName: 'Candidato Teste',
				userId,
				jobName: 'Desenvolvedor Frontend',
				recruiterInterviewLink: `https://dashboard.coploy.io/interview/${jobId}?candidateId=${userId}&jobAppliedRef=${interviewId}`,
				candidateInterviewLink: `${env.INTERVIEW_BASE_URL}/job/${jobId}/company/${companyId}`,
				score: 8.5,
				approved: true,
				feedback: companyFeedback,
				candidateFeedback,
				timestamp: new Date().toISOString(),
			}

			try {
				const response = await fetch(params.url, {
					method: params.method,
					headers: {
						'Content-Type': 'application/json',
						...(params.headers ?? {}),
					},
					body: JSON.stringify(testPayload),
					signal: AbortSignal.timeout(10000),
				})

				return {
					success: response.ok,
					statusCode: response.status,
					message: response.ok
						? 'Webhook enviado com sucesso'
						: `Endpoint retornou status ${response.status}`,
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Erro desconhecido'
				return { success: false, message: `Falha na conexão: ${message}` }
			}
		},

		async listDeliveryLogs(companyId: string, limit = 20): Promise<WebhookDeliveryLog[]> {
			return infra.webhookDeliveryLogRepository.listByCompany(companyId, limit)
		},

		async getDeliveryLog(id: string): Promise<WebhookDeliveryLog | null> {
			return infra.webhookDeliveryLogRepository.getById(id)
		},

		async retryDelivery(
			logId: string,
			companyId: string,
		): Promise<{ success: boolean; statusCode?: number; message: string }> {
			const log = await infra.webhookDeliveryLogRepository.getById(logId)
			if (!log || log.companyId !== companyId) {
				return { success: false, message: 'Log not found' }
			}

			const startTime = Date.now()
			let statusCode: number | null = null
			let responseBody: string | null = null
			let success = false
			let errorMessage: string | null = null

			try {
				const response = await fetch(log.url, {
					method: log.method,
					headers: {
						'Content-Type': 'application/json',
						...(log.requestHeaders ?? {}),
					},
					body: JSON.stringify(log.requestBody),
					signal: AbortSignal.timeout(15000),
				})

				statusCode = response.status
				success = response.ok

				try {
					responseBody = await response.text()
					if (responseBody && responseBody.length > 2000) {
						responseBody = responseBody.slice(0, 2000) + '...'
					}
				} catch {
					// ignore
				}

				if (!response.ok) {
					errorMessage = `HTTP ${response.status}`
				}
			} catch (err) {
				errorMessage = err instanceof Error ? err.message : 'Unknown error'
			}

			const durationMs = Date.now() - startTime

			// Save new delivery log for the retry
			await infra.webhookDeliveryLogRepository.create({
				webhookId: log.webhookId,
				companyId: log.companyId,
				event: log.event,
				url: log.url,
				method: log.method,
				requestHeaders: log.requestHeaders,
				requestBody: log.requestBody,
				statusCode,
				responseBody,
				success,
				errorMessage,
				durationMs,
			})

			return {
				success,
				statusCode: statusCode ?? undefined,
				message: success
					? 'Webhook reenviado com sucesso'
					: errorMessage ?? `Endpoint retornou status ${statusCode}`,
			}
		},
	}
}
