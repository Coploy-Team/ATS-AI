import ExcelJS from 'exceljs'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { postmarkClient } from '@/lib/postmark-client'

export function getInterviewTestStatusMessage(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/communication/messages/export',
			{
				schema: {
					tags: ['communication'],
					security: [{ bearerAuth: [] }],
					summary: 'Exportar mensagens enviadas pelo Postmark',
					querystring: z.object({
						limit: z.string().default('100').transform(Number),
						format: z.enum(['json', 'csv', 'excel']).default('json'),
						subject: z.string().optional(),
						offset: z
							.string()
							.optional()
							.transform((val) => (val ? Number(val) : 0)),
					}),
					response: {
						200: z.union([
							z.object({
								messages: z.array(
									z.object({
										email: z.string(),
										subject: z.string(),
										status: z.string(),
										opens: z.number(),
										clicks: z.number(),
										sentAt: z.string(),
									}),
								),
								pagination: z.object({
									nextOffset: z.number().nullable(),
									hasMore: z.boolean(),
									limit: z.number(),
									total: z.number(),
									subject: z.string().optional(),
									totalEstimated: z.number(),
									totalPages: z.number(),
									currentPage: z.number(),
								}),
							}),
							z.any(), // Para permitir respostas de buffer ao baixar arquivos
						]),
					},
				},
			},
			async (request, reply) => {
				try {
					// Garante que o usuário está autenticado
					await request.getUserMembership()

					const { limit, format, subject, offset } = request.query

					// Busca as mensagens do Postmark
					const result = await postmarkClient.exportMessages(
						limit,
						subject,
						offset,
					)

					// Se for formato CSV ou Excel, gera o arquivo
					if (format === 'csv' || format === 'excel') {
						const workbook = new ExcelJS.Workbook()
						const worksheet = workbook.addWorksheet('Mensagens')

						// Configura as colunas
						worksheet.columns = [
							{ header: 'Email', key: 'email', width: 30 },
							{ header: 'Assunto', key: 'subject', width: 40 },
							{ header: 'Status', key: 'status', width: 15 },
							{ header: 'Aberturas', key: 'opens', width: 10 },
							{ header: 'Cliques', key: 'clicks', width: 10 },
							{ header: 'Data de Envio', key: 'sentAt', width: 20 },
						]

						// Adiciona os dados
						worksheet.addRows(result.messages)

						// Adiciona informações de paginação ao final do arquivo
						worksheet.addRow(['', '', '', '', '', ''])
						worksheet.addRow(['Informações de Paginação:', '', '', '', '', ''])
						worksheet.addRow([
							`Página atual: ${result.pagination.currentPage} de ${result.pagination.totalPages}`,
							'',
							'',
							'',
							'',
							'',
						])
						worksheet.addRow([
							`Total estimado: ${result.pagination.totalEstimated} mensagens`,
							'',
							'',
							'',
							'',
							'',
						])

						// Adiciona instrução para continuar se houver mais dados
						if (result.pagination.hasMore) {
							worksheet.addRow([
								`Para continuar, use: offset=${result.pagination.nextOffset}`,
								'',
								'',
								'',
								'',
								'',
							])
						}

						// Timestamp para o nome do arquivo
						const timestamp = Date.now()

						// Nome do arquivo inclui informações sobre o conjunto de dados
						const fileName = subject
							? `postmark_${subject.replace(/[^a-z0-9]/gi, '_')}_${offset}_de_${result.pagination.totalEstimated}_${timestamp}`
							: `postmark_export_${offset}_de_${result.pagination.totalEstimated}_${timestamp}`

						// Configura o buffer e resposta
						if (format === 'csv') {
							const buffer = await workbook.csv.writeBuffer()
							reply.type('text/csv')
							reply.header(
								'Content-Disposition',
								`attachment; filename="${fileName}.csv"`,
							)
							return reply.send(buffer)
						}
						// Excel
						const buffer = await workbook.xlsx.writeBuffer()
						reply.type(
							'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						)
						reply.header(
							'Content-Disposition',
							`attachment; filename="${fileName}.xlsx"`,
						)
						return reply.send(buffer)
					}

					// Padrão: retorna JSON com mensagens e informações de paginação
					return {
						messages: result.messages,
						pagination: result.pagination,
					}
				} catch (error) {
					// Erros de autenticação serão tratados pelo middleware auth
					// Somente outros erros da aplicação são capturados aqui
					if (error instanceof Error) {
						throw new BadRequestError(error.message)
					}
					throw new BadRequestError('Erro ao exportar mensagens do Postmark')
				}
			},
		)
}
