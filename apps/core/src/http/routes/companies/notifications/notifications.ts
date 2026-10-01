import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { UnauthorizedError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createNotificationService } from '@/lib/services/notification-service'

// Definir o tipo para as notificações
type CompanyNotification = {
	id: string
	title: string
	message: string
	status: boolean
	read?: boolean
	dateTime?: unknown
	type?: string
	actionRef?: string
	postId?: string
}

/**
 * `null` → ausente.
 *
 * O Firestore simplesmente não tem o campo quando ele não foi gravado; o
 * Postgres devolve NULL na coluna. Sem normalizar, a MESMA rota responde 200
 * no SaaS e 400 na open ("Expected string, received null") — e o cliente
 * teria que saber em que edição está falando.
 */
function semNulo<T>(valor: T | null | undefined): T | undefined {
	return valor ?? undefined
}

const notificationSchema = z.object({
	id: z.string(),
	title: z.string(),
	message: z.string(),
	status: z.boolean(),
	read: z.boolean().optional(),
	dateTime: z.string(),
	type: z.string().optional(),
	actionRef: z.string().optional(),
	postId: z.string().optional(),
	jobId: z.string().nullable().optional(),
})

// Schema para atualização completa (PUT)
const updateNotificationSchema = z.object({
	title: z.string(),
	message: z.string(),
	status: z.boolean(),
	read: z.boolean(),
	actionRef: z.string().optional(),
	type: z.string(),
})

// Schema para atualização parcial (PATCH)
const patchNotificationSchema = z.object({
	title: z.string().optional(),
	message: z.string().optional(),
	status: z.boolean().optional(),
	read: z.boolean().optional(),
	actionRef: z.string().optional(),
	type: z.string().optional(),
})

export function notificationsRoutes(app: FastifyInstance) {
	const notificationService = createNotificationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		// GET - Listar notificações
		.get<{
			Params: {
				companyId: string
			}
			Querystring: {
				limit?: number
				unreadOnly?: boolean
			}
		}>(
			'/companies/:companyId/notifications',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Get company notifications by company ID',
					params: z.object({
						companyId: z.string(),
					}),
					querystring: z.object({
						limit: z.coerce.number().int().min(1).max(200).default(10),
						unreadOnly: z
							.union([z.boolean(), z.string()])
							.transform((v) => (typeof v === 'string' ? v === 'true' : v))
							.default(true),
					}),
					security: [{ bearerAuth: [] }],
					response: {
						200: z.object({
							notifications: z.array(notificationSchema),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { companyId } = request.params
					const limit = request.query.limit ?? 10
					const unreadOnly = request.query.unreadOnly ?? true
					const user = await request.getUserMembership()

					if (user?.company?.id !== companyId) {
						throw new BadRequestError(
							'Você não tem permissão para acessar esta notificação',
						)
					}

					// IMPORTANT: limitTo previne OOM em empresas com milhares de notificações.
					// Quando unreadOnly, fazemos overfetch e filtramos em memória — não dá pra
					// usar filtro != no Firestore combinado com orderBy num campo diferente
					// (Firestore exige que o primeiro orderBy seja no campo da inequality).
					const fetchLimit = unreadOnly ? Math.min(Math.max(limit * 5, 50), 200) : limit

					const rawNotifications = (await notificationService.listCompanyNotifications(
						companyId,
						{
							orderByField: 'dateTime',
							orderDirection: 'desc',
							limitTo: fetchLimit,
						},
					)) as CompanyNotification[]

					const notifications = unreadOnly
						? rawNotifications.filter((n) => n.status !== true)
						: rawNotifications

					// Deduplicar actionRefs para evitar N+1 redundante
					const uniqueActionRefs = Array.from(
						new Set(
							notifications
								.map((n) => n.actionRef)
								.filter((ref): ref is string => !!ref),
						),
					)
					const jobIdByActionRef = new Map<string, string | null>()
					await Promise.all(
						uniqueActionRefs.map(async (actionRef) => {
							const jobId = await notificationService.extractJobIdFromActionRef(actionRef)
							jobIdByActionRef.set(actionRef, jobId)
						}),
					)

					// Processar notificações individualmente - continua mesmo se uma falhar
					const processedNotificationsResults = await Promise.allSettled(
						notifications.map(async (notification) => {
							const dateTime =
								notification.dateTime != null &&
								typeof (notification.dateTime as unknown as { toDate?: () => Date }).toDate === 'function'
									? (notification.dateTime as unknown as { toDate: () => Date }).toDate().toISOString()
									: notification.dateTime instanceof Date
										? (notification.dateTime as Date).toISOString()
										: new Date().toISOString()

							const jobId = notification.actionRef
								? jobIdByActionRef.get(notification.actionRef) ?? null
								: null

							return {
								id: notification.id,
								title: notification.title,
								message: notification.message,
								/*
								 * `status` aqui é "já tratada". Ausente = nunca foi tratada,
								 * e não motivo pra derrubar a resposta inteira: o schema
								 * exige boolean e o documento antigo pode não ter o campo.
								 */
								status: notification.status === true,
								read: semNulo(notification.read),
								actionRef: semNulo(notification.actionRef),
								type: semNulo(notification.type),
								dateTime,
								postId: semNulo(notification.postId),
								jobId,
							}
						}),
					)

					// Filtrar apenas as notificações que foram processadas com sucesso
					const processedNotifications = processedNotificationsResults
						.filter((result) => result.status === 'fulfilled')
						.map((result) => (result as PromiseFulfilledResult<Record<string, unknown>>).value)
						/*
						 * Sem título ou mensagem a notificação não é exibível — e, pior,
						 * derrubava a LISTA INTEIRA com 400 ("Response validation error"),
						 * porque o schema exige os dois. Uma linha quebrada matava o sino
						 * do ATS. Some da lista e fica registrada no log.
						 *
						 * Existe linha assim no selfhosted anterior à migration 0048: a
						 * tabela não tinha coluna para título/mensagem e `cleanForDb`
						 * descartava os campos na escrita, em silêncio.
						 */
						.filter((notification) => {
							const exibivel =
								typeof notification.title === 'string' &&
								typeof notification.message === 'string'
							if (!exibivel) {
								request.log.warn(
									{ companyId, notificationId: notification.id },
									'[notifications] notificação sem título/mensagem ignorada',
								)
							}
							return exibivel
						})
						// Remover notificações com jobId null (referência quebrada)
						.filter((notification) => {
							// Se tem actionRef mas jobId é null, significa que a referência está quebrada
							if (notification.actionRef && notification.jobId === null) {
								return false
							}
							// Manter notificações que:
							// - Não têm actionRef (notificações de sistema)
							// - Têm actionRef e jobId válido
							return true
						})

					// Slice apenas no final, DEPOIS de filtrar jobIds quebrados —
					// senão corremos o risco de derrubar o top-N só porque algumas notificações
					// apontam para jobs deletados.
					const finalNotifications = processedNotifications.slice(0, limit)

					return {
						notifications: finalNotifications,
					}
				} catch (error) {
					// Re-throw UnauthorizedError to preserve 401 status
					if (error instanceof UnauthorizedError) {
						throw error
					}
					request.log.error({ err: error }, '[notifications] failed to list company notifications')
					throw new BadRequestError('Erro ao buscar notificações')
				}
			},
		)

		// PUT - Atualização completa de uma notificação
		.put<{
			Params: {
				companyId: string
				notificationId: string
			}
			Body: z.infer<typeof updateNotificationSchema>
		}>(
			'/companies/:companyId/notifications/:notificationId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Update a notification completely',
					params: z.object({
						companyId: z.string(),
						notificationId: z.string(),
					}),
					body: updateNotificationSchema,
					security: [{ bearerAuth: [] }],
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { companyId, notificationId } = request.params
					const updateData = request.body

					await notificationService.updateCompanyNotification(
						companyId,
						notificationId,
						{
							...updateData,
							dateTime: new Date(),
						},
					)

					return { message: 'Notification updated successfully' }
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)

		// PATCH - Marcar todas as notificações como lidas
		// IMPORTANTE: declarar ANTES de /:notificationId para não colidir na rota param.
		.patch<{
			Params: {
				companyId: string
			}
		}>(
			'/companies/:companyId/notifications/read-all',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Mark all notifications as read',
					params: z.object({
						companyId: z.string(),
					}),
					security: [{ bearerAuth: [] }],
					response: {
						200: z.object({
							message: z.string(),
							updated: z.number(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { companyId } = request.params
					const user = await request.getUserMembership()

					if (user?.company?.id !== companyId) {
						throw new BadRequestError(
							'Você não tem permissão para acessar esta notificação',
						)
					}

					// Overfetch bounded — companies com milhares ficariam caras, mas
					// um cap de 500 mantém a operação O(n) previsível.
					const raw = (await notificationService.listCompanyNotifications(
						companyId,
						{
							orderByField: 'dateTime',
							orderDirection: 'desc',
							limitTo: 500,
						},
					)) as CompanyNotification[]

					const unread = raw.filter((n) => n.status !== true)

					const results = await Promise.allSettled(
						unread.map((n) =>
							notificationService.updateCompanyNotification(companyId, n.id, {
								status: true,
								read: true,
							}),
						),
					)

					const updated = results.filter((r) => r.status === 'fulfilled').length
					const failed = results.length - updated
					if (failed > 0) {
						request.log.warn(
							{ companyId, failed, updated },
							'[notifications] markAllAsRead: some updates failed',
						)
					}

					return {
						message: 'Notificações marcadas como lidas',
						updated,
					}
				} catch (error) {
					if (error instanceof UnauthorizedError) throw error
					request.log.error(
						{ err: error },
						'[notifications] failed to mark all as read',
					)
					throw new BadRequestError('Erro ao marcar todas como lidas')
				}
			},
		)

		// PATCH - Atualização parcial de uma notificação
		.patch<{
			Params: {
				companyId: string
				notificationId: string
			}
			Body: z.infer<typeof patchNotificationSchema>
		}>(
			'/companies/:companyId/notifications/:notificationId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Update a notification partially',
					params: z.object({
						companyId: z.string(),
						notificationId: z.string(),
					}),
					body: patchNotificationSchema,
					security: [{ bearerAuth: [] }],
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { companyId, notificationId } = request.params
					const updateData = request.body

					await notificationService.updateCompanyNotification(
						companyId,
						notificationId,
						updateData,
					)

					return { message: 'Notification updated partially successfully' }
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)

		// DELETE - Remover uma notificação
		.delete<{
			Params: {
				companyId: string
				notificationId: string
			}
		}>(
			'/companies/:companyId/notifications/:notificationId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Delete a notification',
					params: z.object({
						companyId: z.string(),
						notificationId: z.string(),
					}),
					security: [{ bearerAuth: [] }],
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const { companyId, notificationId } = request.params

					await notificationService.deleteCompanyNotification(
						companyId,
						notificationId,
					)

					return { message: 'Notification deleted successfully' }
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)

		// POST - Criar uma nova notificação
		.post<{
			Params: {
				companyId: string
			}
			Body: {
				title: string
				message: string
				status: boolean
				read?: boolean
				type?: string
				actionRef?: string
				postId?: string
			}
		}>(
			'/companies/:companyId/notifications',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					summary: 'Create a new company notification',
					params: z.object({
						companyId: z.string(),
					}),
					body: z.object({
						title: z.string(),
						message: z.string(),
						status: z.boolean(),
						read: z.boolean().optional(),
						type: z.string().optional(),
						actionRef: z.string().optional(),
						postId: z.string().optional(),
					}),
					security: [{ bearerAuth: [] }],
					response: {
						201: z.object({
							message: z.string(),
							notificationId: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				try {
					const { companyId } = request.params
					const notificationData = {
						...request.body,
						dateTime: new Date(),
					}

					const docRef = await notificationService.createCompanyNotification(
						companyId,
						notificationData,
					)

					return reply.status(201).send({
						message: 'Notificação criada com sucesso',
						notificationId: docRef.id,
					})
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
