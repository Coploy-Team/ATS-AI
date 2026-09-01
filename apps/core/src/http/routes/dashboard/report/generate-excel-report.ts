import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { BadRequestError } from '@coploy/shared/errors'
import {
	generateExcelFile,
	createExcelReportService,
} from '@/lib/services/excel-report-service'
import {
	generateExcelReportBodySchema,
	generateExcelReportByYearBodySchema,
	generateExcelReportErrorSchema,
	generateExcelReportResponseSchema,
	getExcelReportErrorSchema,
	getExcelReportParamsSchema,
	getExcelReportSuccessSchema,
} from '@/schemas/excel-report-schema'
import type { Company } from '@coploy/domain'
import type { ExcelReportFilters } from '@/types/excel-report'
import { jobIdsInScope } from '@/lib/access-scope'
import { createAuth } from '../../middlewares/auth'

// Storage layout (GCS/MinIO):
//   excel-reports/<companyId>/<uid>.processing  (marker enquanto roda)
//   excel-reports/<companyId>/<uid>.xlsx        (resultado pronto)
//   excel-reports/<companyId>/<uid>.error       (mensagem de erro em texto)
//
// Cleanup é responsabilidade do bucket (lifecycle rule). O file final é
// removido manualmente após download bem-sucedido pra economizar storage.
const STORAGE_PREFIX = 'excel-reports'

function reportPath(companyId: string): string {
	return `${STORAGE_PREFIX}/${companyId}`
}

export function generateExcelReport(app: FastifyInstance) {
	const { generateExcelReportData } = createExcelReportService(app.infra)
	const storage = app.infra.storage

	async function generateReportInBackground(
		companyId: string,
		uidTemporario: string,
		filters: ExcelReportFilters | undefined,
	): Promise<void> {
		const path = reportPath(companyId)
		try {
			const reportData = await generateExcelReportData(companyId, { filters })
			const base64Excel = await generateExcelFile(reportData)
			const buffer = Buffer.from(base64Excel, 'base64')

			await storage.uploadFile(
				buffer,
				path,
				`${uidTemporario}.xlsx`,
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			)
			await storage.deleteFile(path, `${uidTemporario}.processing`)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Erro desconhecido'
			app.log.error(
				{ err: error, companyId, uidTemporario },
				'excel-report background generation failed',
			)
			try {
				await storage.uploadFile(
					Buffer.from(message, 'utf-8'),
					path,
					`${uidTemporario}.error`,
					'text/plain',
				)
				await storage.deleteFile(path, `${uidTemporario}.processing`)
			} catch (cleanupError) {
				app.log.error(
					{ err: cleanupError, uidTemporario },
					'excel-report failed to write error marker',
				)
			}
		}
	}

	// Endpoint para gerar o relatório
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/generate-excel-report',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['reports'],
					security: [{ bearerAuth: [] }],
					summary: 'Generate Excel report for completed interviews',
					body: generateExcelReportBodySchema,
					response: {
						200: generateExcelReportResponseSchema,
						500: generateExcelReportErrorSchema,
					},
				},
			},
			async (request, reply) => {
				const userMembership = await request.getUserMembership()
				const companyId = (userMembership.company as Company & { id: string }).id

				if (!companyId) {
					throw new BadRequestError('ID da empresa é obrigatório')
				}

				/*
				 * O alcance é resolvido AQUI, na requisição, e viaja com os filtros.
				 * O relatório roda em segundo plano, sem request nenhum — resolver
				 * lá dentro seria impossível, e gerar sem recorte transformaria a
				 * planilha na porta que a tela fechou.
				 */
				const alcance = await jobIdsInScope(app.infra, request, companyId)

				try {
					const timestamp = Date.now()
					const uidTemporario = `${companyId}_${timestamp}`
					const path = reportPath(companyId)

					// Marker de "processando" — gravado ANTES de retornar pra evitar
					// race entre o GET (em outra instância) e o background.
					await storage.uploadFile(
						Buffer.from('processing', 'utf-8'),
						path,
						`${uidTemporario}.processing`,
						'text/plain',
					)

					// Background: explicitly catch para não virar unhandled rejection.
					generateReportInBackground(
						companyId,
						uidTemporario,
						{ ...(request.body.filters ?? {}), jobIdsInScope: alcance },
					).catch((err) => {
						app.log.error({ err, uidTemporario }, 'excel-report background unhandled')
					})

					return reply.send({
						processo_iniciado: true,
						uid_temporario: uidTemporario,
					})
				} catch (error) {
					return reply.status(500).send({
						processo_iniciado: false,
						message: `Erro ao iniciar geração do relatório: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
					})
				}
			},
		)

	// Endpoint para buscar o relatório gerado
	app.withTypeProvider<ZodTypeProvider>().register(createAuth(app.infra)).get(
		'/get-excel-report/:uidTemporario',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['reports'],
				security: [{ bearerAuth: [] }],
				summary: 'Get generated Excel report by temporary ID',
				params: getExcelReportParamsSchema,
				response: {
					200: getExcelReportSuccessSchema,
					404: getExcelReportErrorSchema,
					500: getExcelReportErrorSchema,
				},
			},
		},
		async (request, reply) => {
			const { uidTemporario } = request.params

			// Extrai companyId do prefixo do uid (formato: <companyId>_<timestamp>).
			// Garante que o usuário só pode ler relatórios da própria empresa.
			const userMembership = await request.getUserMembership()
			const userCompanyId = (userMembership.company as Company & { id: string }).id
			const lastUnderscore = uidTemporario.lastIndexOf('_')
			const ownerCompanyId =
				lastUnderscore > 0 ? uidTemporario.slice(0, lastUnderscore) : uidTemporario

			if (!userCompanyId || ownerCompanyId !== userCompanyId) {
				return reply.status(404).send({
					base64Excel: null,
					message: 'Relatório não encontrado ou expirado.',
					status: 'not_found' as const,
				})
			}

			const path = reportPath(ownerCompanyId)

			try {
				// 1. Resultado pronto?
				const buffer = await storage.downloadFile(path, `${uidTemporario}.xlsx`)
				if (buffer) {
					const base64Excel = buffer.toString('base64')
					// Cleanup após entrega — alinha com comportamento anterior.
					storage
						.deleteFile(path, `${uidTemporario}.xlsx`)
						.catch((err) =>
							app.log.warn({ err, uidTemporario }, 'excel-report cleanup failed'),
						)
					return reply.send({
						base64Excel,
						message: 'Relatório encontrado com sucesso.',
						status: 'completed' as const,
					})
				}

				// 2. Erro persistido?
				const errorBuffer = await storage.downloadFile(path, `${uidTemporario}.error`)
				if (errorBuffer) {
					const errorMessage = errorBuffer.toString('utf-8')
					storage
						.deleteFile(path, `${uidTemporario}.error`)
						.catch((err) =>
							app.log.warn({ err, uidTemporario }, 'excel-report error cleanup failed'),
						)
					return reply.status(500).send({
						base64Excel: null,
						message: `Falha ao gerar relatório: ${errorMessage}`,
						status: 'failed' as const,
					})
				}

				// 3. Ainda processando?
				const processing = await storage.fileExists(
					path,
					`${uidTemporario}.processing`,
				)
				if (processing) {
					return reply.status(404).send({
						base64Excel: null,
						message: 'Relatório em processamento. Tente novamente em alguns instantes.',
						status: 'processing' as const,
					})
				}

				// 4. Não existe.
				return reply.status(404).send({
					base64Excel: null,
					message: 'Relatório não encontrado ou expirado.',
					status: 'not_found' as const,
				})
			} catch (error) {
				return reply.status(500).send({
					base64Excel: null,
					message: `Erro ao buscar relatório: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
					status: 'not_found' as const,
				})
			}
		},
	)
}

export function generateExcelReportByYear(app: FastifyInstance) {
	const { generateExcelReportData } = createExcelReportService(app.infra)
	const storage = app.infra.storage

	async function generateReportInBackground(
		companyId: string,
		uidTemporario: string,
		year: number,
		filters: ExcelReportFilters | undefined,
	): Promise<void> {
		const path = reportPath(companyId)
		try {
			const reportData = await generateExcelReportData(companyId, { year, filters })
			const base64Excel = await generateExcelFile(reportData)
			const buffer = Buffer.from(base64Excel, 'base64')

			await storage.uploadFile(
				buffer,
				path,
				`${uidTemporario}.xlsx`,
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			)
			await storage.deleteFile(path, `${uidTemporario}.processing`)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Erro desconhecido'
			app.log.error(
				{ err: error, companyId, uidTemporario },
				'excel-report-by-year background generation failed',
			)
			try {
				await storage.uploadFile(
					Buffer.from(message, 'utf-8'),
					path,
					`${uidTemporario}.error`,
					'text/plain',
				)
				await storage.deleteFile(path, `${uidTemporario}.processing`)
			} catch (cleanupError) {
				app.log.error(
					{ err: cleanupError, uidTemporario },
					'excel-report-by-year failed to write error marker',
				)
			}
		}
	}

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/generate-excel-report-by-year',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['reports'],
					security: [{ bearerAuth: [] }],
					summary: 'Generate Excel report for completed interviews filtered by year',
					body: generateExcelReportByYearBodySchema,
					response: {
						200: generateExcelReportResponseSchema,
						500: generateExcelReportErrorSchema,
					},
				},
			},
			async (request, reply) => {
				const { year, filters } = request.body
				const userMembership = await request.getUserMembership()
				const companyId = (userMembership.company as Company & { id: string }).id

				if (!companyId) {
					throw new BadRequestError('ID da empresa é obrigatório')
				}

				// mesmo recorte do relatório sem ano — ver o comentário lá
				const alcanceAnual = await jobIdsInScope(app.infra, request, companyId)

				try {
					const timestamp = Date.now()
					const uidTemporario = `${companyId}_${timestamp}`
					const path = reportPath(companyId)

					await storage.uploadFile(
						Buffer.from('processing', 'utf-8'),
						path,
						`${uidTemporario}.processing`,
						'text/plain',
					)

					generateReportInBackground(
						companyId,
						uidTemporario,
						year,
						{ ...(filters ?? {}), jobIdsInScope: alcanceAnual },
					).catch(
						(err) => {
							app.log.error(
								{ err, uidTemporario },
								'excel-report-by-year background unhandled',
							)
						},
					)

					return reply.send({
						processo_iniciado: true,
						uid_temporario: uidTemporario,
					})
				} catch (error) {
					return reply.status(500).send({
						processo_iniciado: false,
						message: `Erro ao iniciar geração do relatório: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
					})
				}
			},
		)
}
