import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createNotificationService } from '@/lib/services/notification-service'

type NotificationMessage = {
	id: string
	name: string
	message: string
	creator: string
	created_at: Date | { seconds: number; nanoseconds: number }
}

//Listar todas as mensagens de notificação de uma empresa
export function notificationsMessagesRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/:companyId/notifications/messages',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Get all notification messages',
					params: z.object({
						companyId: z.string(),
					}),
					response: {
						200: z.object({
							messages: z.array(
								z.object({
									id: z.string(),
									name: z.string(),
									message: z.string(),
									creator: z.string(),
									created_at: z.string(),
								}),
							),
						}),
						401: z.object({
							error: z.string(),
							code: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				try {
					const { companyId } = request.params
					const { company } = await request.getUserMembership()

					// Validate if the requested company matches the authenticated user's company
					if (companyId !== company.id) {
						throw new BadRequestError(
							"Unauthorized to access this company's notifications",
						)
					}

					const messages =
						(await notificationService.listNotificationMessages(
							company.id,
							{
								orderByField: 'created_at',
								orderDirection: 'desc',
							},
						)) as NotificationMessage[]

					const formattedMessages = messages.map((message) => {
						// Trata o timestamp do Firestore
						let dateStr: string
						const createdAt = message.created_at
						if (
							createdAt &&
							typeof createdAt === 'object' &&
							'seconds' in createdAt
						) {
							dateStr = new Date(createdAt.seconds * 1000).toISOString()
						} else if (createdAt instanceof Date) {
							dateStr = createdAt.toISOString()
						} else {
							dateStr = new Date().toISOString()
						}

						// Trata o DocumentReference do Firestore
						let creatorStr: string
						if (typeof message.creator === 'string') {
							creatorStr = message.creator
						} else if (
							message.creator &&
							typeof message.creator === 'object' &&
							'path' in message.creator
						) {
							creatorStr = (message.creator as { path: string }).path
						} else {
							creatorStr = ''
						}

						return {
							id: message.id || '',
							name: message.name || '',
							message: message.message || '',
							creator: creatorStr,
							created_at: dateStr,
						}
					})

					return {
						messages: formattedMessages,
					}
				} catch (error: any) {
					// Check if it's a Firebase Auth error
					if (
						error?.errorInfo?.code === 'auth/argument-error' &&
						error.message.includes('token')
					) {
						return reply.status(401).send({
							error: 'auth/token-expired',
							code: 'UNAUTHORIZED',
							message: 'Your session has expired. Please sign in again.',
						})
					}

					throw error
				}
			},
		)
}

//Pegar uma mensagem de notificação específica
export function getNotificationMessageRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/:companyId/notifications/messages/:messageId',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Get a specific notification message',
					params: z.object({
						companyId: z.string(),
						messageId: z.string(),
					}),
					response: {
						200: z.object({
							message: z.object({
								id: z.string(),
								name: z.string(),
								message: z.string(),
								creator: z.string(),
								created_at: z.string(),
							}),
						}),
					},
				},
			},
			async (request, reply) => {
				const { companyId, messageId } = request.params
				const { company } = await request.getUserMembership()

				if (companyId !== company.id) {
					throw new BadRequestError(
						"Unauthorized to access this company's notifications",
					)
				}

				const notificationMessage = (await notificationService.getNotificationMessage(
					company.id,
					messageId,
				)) as NotificationMessage | null

				if (!notificationMessage) {
					throw new BadRequestError('Notification message not found')
				}

				// Formatar a data
				let dateStr: string
				const createdAt = notificationMessage.created_at
				if (
					createdAt &&
					typeof createdAt === 'object' &&
					'seconds' in createdAt
				) {
					dateStr = new Date(createdAt.seconds * 1000).toISOString()
				} else if (createdAt instanceof Date) {
					dateStr = createdAt.toISOString()
				} else {
					dateStr = new Date().toISOString()
				}

				// Formatar o creator
				let creatorStr: string
				if (typeof notificationMessage.creator === 'string') {
					creatorStr = notificationMessage.creator
				} else if (
					notificationMessage.creator &&
					typeof notificationMessage.creator === 'object' &&
					'path' in notificationMessage.creator
				) {
					creatorStr = (notificationMessage.creator as { path: string }).path
				} else {
					creatorStr = ''
				}

				return reply.status(200).send({
					message: {
						id: notificationMessage.id,
						name: notificationMessage.name,
						message: notificationMessage.message,
						creator: creatorStr,
						created_at: dateStr,
					},
				})
			},
		)
}

//Criar uma nova mensagem de notificação
export function createNotificationMessageRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/:companyId/notifications/messages',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Create a new notification message',
					params: z.object({
						companyId: z.string(),
					}),
					body: z.object({
						name: z.string(),
						message: z.string(),
						creator: z.string(),
					}),
					response: {
						201: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { companyId } = request.params
				const { company } = await request.getUserMembership()

				if (companyId !== company.id) {
					throw new BadRequestError(
						"Unauthorized to access this company's notifications",
					)
				}

				const { name, message, creator } = request.body

				await notificationService.createNotificationMessage(
					company.id,
					{
						name,
						message,
						creator,
						created_at: new Date(),
					},
				)

				return reply.status(201).send({
					message: 'Notification message created successfully',
				})
			},
		)
}

//Atualizar uma mensagem de notificação existente
export function updateNotificationMessageAllFieldsRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies/:companyId/notifications/messages/:messageId',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Update all fields of an existing notification message',
					params: z.object({
						companyId: z.string(),
						messageId: z.string(),
					}),
					body: z.object({
						name: z.string(),
						message: z.string(),
						creator: z.string(),
					}),
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { companyId, messageId } = request.params
				const { company } = await request.getUserMembership()

				if (companyId !== company.id) {
					throw new BadRequestError(
						"Unauthorized to access this company's notifications",
					)
				}

				const { name, message, creator } = request.body as {
					name: string
					message: string
					creator: string
				}

				const messages = (await notificationService.listNotificationMessages(
					company.id,
					{
						orderByField: 'created_at',
						orderDirection: 'desc',
					},
				)) as NotificationMessage[]

				const notificationMessage = messages.find(
					(messageItem) => messageItem.id === messageId,
				)

				if (!notificationMessage) {
					throw new BadRequestError('Notification message not found')
				}

				await notificationService.updateNotificationMessage(
					company.id,
					messageId,
					{ name, message, creator },
				)

				return reply.status(200).send({
					message: 'Notification message updated successfully',
				})
			},
		)
}

//Atualizar campos específicos de uma mensagem de notificação existente
export function updateNotificationMessageRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies/:companyId/notifications/messages/:messageId',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Update specific fields of an existing notification message',
					params: z.object({
						companyId: z.string(),
						messageId: z.string(),
					}),
					body: z.object({
						name: z.string().optional(),
						message: z.string().optional(),
						creator: z.string().optional(),
					}),
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { companyId, messageId } = request.params
				const { company } = await request.getUserMembership()

				if (companyId !== company.id) {
					throw new BadRequestError(
						"Unauthorized to access this company's notifications",
					)
				}

				const updateData = request.body as {
					name?: string
					message?: string
					creator?: string
				}

				const messages = (await notificationService.listNotificationMessages(
					company.id,
					{
						orderByField: 'created_at',
						orderDirection: 'desc',
					},
				)) as NotificationMessage[]

				const notificationMessage = messages.find(
					(message) => message.id === messageId,
				)

				if (!notificationMessage) {
					throw new BadRequestError('Notification message not found')
				}

				await notificationService.updateNotificationMessage(
					company.id,
					messageId,
					updateData,
				)

				return reply.status(200).send({
					message: 'Notification message updated successfully',
				})
			},
		)
}

//Deletar uma mensagem de notificação existente
export function deleteNotificationMessageRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/companies/:companyId/notifications/messages/:messageId',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['notifications'],
					summary: 'Delete an existing notification message',
					params: z.object({
						companyId: z.string(),
						messageId: z.string(),
					}),
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { companyId, messageId } = request.params
				const { company } = await request.getUserMembership()

				// Validate if the requested company matches the authenticated user's company
				if (companyId !== company.id) {
					throw new BadRequestError(
						"Unauthorized to access this company's notifications",
					)
				}

				await notificationService.deleteNotificationMessage(
					company.id,
					messageId,
				)

				return reply.status(200).send({
					message: 'Notification message deleted successfully',
				})
			},
		)
}
