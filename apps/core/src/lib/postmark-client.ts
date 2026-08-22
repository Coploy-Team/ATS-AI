import axios from 'axios'
import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'

type PostmarkMessage = {
	MessageID: string
	From: string
	To: string
	Recipients: string[]
	Subject: string
	Status: string
	ReceivedAt: string
}

type PostmarkMessageDetails = {
	MessageID: string
	From: string
	To: string
	Subject: string
	Status: string
	ReceivedAt: string
	Opens: number
	ClickDetails: { Link: string; Clicks: number }[] | null
	Metadata: Record<string, unknown>
	MessageEvents: PostmarkMessageEvent[]
}

// Nova interface para buscar eventos de mensagem
type PostmarkMessageEvent = {
	Recipient: string
	Type: string
	ReceivedAt: string
	Details: Record<string, unknown>
}

type MessageExportItem = {
	email: string
	subject: string
	status: string
	opens: number
	clicks: number
	sentAt: string
}

type MessageExportResult = {
	messages: MessageExportItem[]
	pagination: {
		nextOffset: number | null // Próximo offset para continuar de onde parou
		hasMore: boolean // Indica se existem mais mensagens para buscar
		limit: number // Limite usado nessa busca
		total: number // Total de mensagens recuperadas nessa chamada
		subject?: string // Filtro de assunto usado, se houver
		totalEstimated: number // Estimativa do total de mensagens disponíveis
		totalPages: number // Número estimado de páginas para completar a consulta
		currentPage: number // Página atual (baseada no offset e limit)
	}
}

type SendEmailParams = {
	from: string
	to: string | string[]
	subject: string
	htmlBody: string
	textBody?: string
	tag?: string
}

type SendEmailResponse = {
	To: string
	SubmittedAt: string
	MessageID: string
	ErrorCode: number
	Message: string
}

type SendEmailWithTemplateParams = {
	from: string
	to: string
	templateId: number
	templateModel: Record<string, unknown>
}

export class PostmarkClient {
	private readonly baseUrl = 'https://api.postmarkapp.com'
	private readonly apiKey: string
	private readonly MAX_OFFSET_LIMIT = 10_000 // Limite máximo da API Postmark

	constructor(apiKey = env.POSTMARK_API_KEY ?? '') {
		this.apiKey = apiKey
	}

	private get headers() {
		return {
			'X-Postmark-Server-Token': this.apiKey,
			'Content-Type': 'application/json',
		}
	}

	/**
	 * Envia um email com conteúdo HTML
	 */
	async sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
		const { from, to, subject, htmlBody, textBody, tag } = params
		const toAddresses = Array.isArray(to) ? to.join(',') : to

		try {
			const response = await axios.post(
				`${this.baseUrl}/email`,
				{
					From: from,
					To: toAddresses,
					Subject: subject,
					HtmlBody: htmlBody,
					TextBody: textBody || '',
					Tag: tag,
					MessageStream: 'outbound',
				},
				{ headers: this.headers }
			)

			return response.data
		} catch (error) {
			throw new BadRequestError(`Falha ao enviar email: ${error as string}`)
		}
	}

	async sendEmailWithTemplate(params: SendEmailWithTemplateParams): Promise<SendEmailResponse> {
		const { from, to, templateId, templateModel } = params

		try {
			const response = await axios.post(
				`${this.baseUrl}/email/withTemplate`,
				{
					From: from,
					To: to,
					TemplateId: templateId,
					TemplateModel: templateModel,
				},
				{ headers: this.headers },
			)

			return response.data
		} catch (error) {
			throw new BadRequestError(`Falha ao enviar email: ${error as string}`)
		}
	}

	/**
	 * Envia emails em lote (máximo 500 por chamada)
	 */
	async sendBatchEmail(
		emails: SendEmailParams[]
	): Promise<SendEmailResponse[]> {
		try {
			const messages = emails.map(
				({ from, to, subject, htmlBody, textBody, tag }) => ({
					From: from,
					To: Array.isArray(to) ? to.join(',') : to,
					Subject: subject,
					HtmlBody: htmlBody,
					TextBody: textBody || '',
					Tag: tag,
					MessageStream: 'outbound',
				})
			)

			const response = await axios.post(
				`${this.baseUrl}/email/batch`,
				messages,
				{ headers: this.headers }
			)

			return response.data
		} catch (error) {
			throw new BadRequestError(
				`Falha ao enviar emails em lote: ${error as string}`
			)
		}
	}

	async fetchOutboundMessages(
		offset = 0,
		count = 100,
		subject?: string,
	): Promise<PostmarkMessage[]> {
		try {
			let valor = count
			// Verificar se estamos dentro do limite da API
			if (offset + count > this.MAX_OFFSET_LIMIT) {
				// Ajustar a contagem para não exceder o limite
				valor = Math.max(0, this.MAX_OFFSET_LIMIT - offset)

				if (valor <= 0) {
					return [] // Retornar array vazio se já atingimos o limite
				}
			}

			const response = await axios.get(`${this.baseUrl}/messages/outbound`, {
				headers: this.headers,
				params: {
					count: valor,
					offset,
					subject,
				},
			})

			return response.data.Messages
		} catch (error) {
			throw new Error(error as string)
		}
	}

	async fetchMessageDetails(
		messageId: string,
	): Promise<PostmarkMessageDetails> {
		try {
			const response = await axios.get(
				`${this.baseUrl}/messages/outbound/${messageId}/details`,
				{
					headers: this.headers,
				},
			)

			return response.data
		} catch (error) {
			throw new BadRequestError(error as string)
		}
	}

	async fetchMessageEvents(messageId: string): Promise<PostmarkMessageEvent[]> {
		try {
			const response = await axios.get(
				`${this.baseUrl}/messages/outbound/${messageId}/events`,
				{
					headers: this.headers,
				},
			)

			return response.data || []
		} catch (error) {
			throw new BadRequestError(error as string)
		}
	}

	async estimateTotalMessages(subject?: string): Promise<number> {
		try {
			// Tenta buscar as ultimas mensagens para estimar o total
			const lastMessages = await this.fetchOutboundMessages(
				this.MAX_OFFSET_LIMIT - 1,
				1,
				subject,
			)

			// Se há mensagens no último offset possível, o total é pelo menos MAX_OFFSET_LIMIT
			if (lastMessages && lastMessages.length > 0) {
				return this.MAX_OFFSET_LIMIT
			}

			// Caso contrário, fazemos uma estimativa baseada em amostragem
			// Testamos até 3 offsets para ver onde os dados terminam
			const testOffsets = [
				Math.floor(this.MAX_OFFSET_LIMIT * 0.5), // 50% do máximo
				Math.floor(this.MAX_OFFSET_LIMIT * 0.25), // 25% do máximo
				Math.floor(this.MAX_OFFSET_LIMIT * 0.1), // 10% do máximo
			]

			for (const testOffset of testOffsets) {
				const messages = await this.fetchOutboundMessages(
					testOffset,
					1,
					subject,
				)
				if (messages && messages.length > 0) {
					// Encontramos mensagens neste offset, então estimamos o total como um pouco maior
					return Math.min(testOffset + 1000, this.MAX_OFFSET_LIMIT)
				}
			}

			// Se nenhum dos testes encontrou mensagens, tentamos um offset pequeno
			const messages = await this.fetchOutboundMessages(0, 1, subject)
			if (messages && messages.length > 0) {
				// Há algumas mensagens, mas não muitas
				return 1000
			}

			// Não há mensagens
			return 0
		} catch {
			return this.MAX_OFFSET_LIMIT
		}
	}

	// Helper para processar uma mensagem individual
	private async processMessage(msg: any): Promise<MessageExportItem> {
		const details = await this.fetchMessageDetails(msg.MessageID)

		// Contar aberturas e cliques baseados nos eventos reais
		const openEvents = details.MessageEvents.filter(
			(event: any) => event.Type === 'Open' || event.Type === 'Opened',
		)

		const clickEvents = details.MessageEvents.filter(
			(event: any) => event.Type === 'Click' || event.Type === 'LinkClicked',
		)

		return {
			email: msg.Recipients[0],
			subject: msg.Subject,
			status: msg.Status,
			opens: openEvents.length || details.Opens || 0,
			clicks: clickEvents.length || details.ClickDetails?.length || 0,
			sentAt: msg.ReceivedAt,
		}
	}

	async exportMessages(
		limit = 100,
		subject?: string,
		startOffset = 0,
	): Promise<MessageExportResult> {
		try {
			let offset = startOffset
			const allResults: MessageExportItem[] = []
			let hasMore = true
			let reachedMaxOffset = false
			const remainingMessages = this.MAX_OFFSET_LIMIT - offset
			const maxMessagesToFetch = Math.min(remainingMessages, 500)
			const totalEstimated = await this.estimateTotalMessages(subject)
			const currentPage = Math.floor(offset / limit) + 1
			const totalPages = Math.ceil(totalEstimated / limit)

			while (hasMore && allResults.length < limit && !reachedMaxOffset) {
				const fetchCount = Math.min(
					maxMessagesToFetch,
					limit - allResults.length,
				)
				try {
					const messages = await this.fetchOutboundMessages(
						offset,
						fetchCount,
						subject,
					)

					if (messages.length === 0) {
						hasMore = false
						break
					}

					await this.processMessages(messages, allResults, limit)

					offset += messages.length
					if (offset >= this.MAX_OFFSET_LIMIT) {
						reachedMaxOffset = true
						break
					}
					hasMore = messages.length === fetchCount
				} catch (error) {
					if (allResults.length > 0) {
						reachedMaxOffset = true
						break
					}
					throw error
				}
			}

			const nextOffset = hasMore || reachedMaxOffset ? offset : null
			return {
				messages: allResults,
				pagination: {
					nextOffset,
					hasMore: hasMore || reachedMaxOffset,
					limit,
					total: allResults.length,
					subject,
					totalEstimated,
					totalPages,
					currentPage,
				},
			}
		} catch (error) {
			throw new BadRequestError(
				`Failed to export messages from Postmark ${error as string}`,
			)
		}
	}

	// Função auxiliar para processar mensagens
	private async processMessages(
		messages: PostmarkMessage[],
		allResults: MessageExportItem[],
		limit: number,
	): Promise<void> {
		for (const msg of messages) {
			const messageResult = await this.processMessage(msg)
			allResults.push(messageResult)
			if (allResults.length >= limit) {
				break
			}
			await new Promise((r) => setTimeout(r, 200))
		}
	}
}

// Exporta uma instância única para uso em toda a aplicação
export const postmarkClient = new PostmarkClient()
