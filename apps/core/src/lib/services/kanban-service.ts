import type { InfraProvider } from '@coploy/infra'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { createEmailTemplateResolver } from '@/lib/services/email-template-resolver'
import {
	LEGACY_REQUIRED_STAGE_IDS,
	PIPELINE_STAGES,
	PIPELINE_STAGE_IDS,
	REJECTION_REASON_TAXONOMY_VERSION,
	STAGE_ACTIONS,
	findRejectionReason,
	normalizeStageId,
	stageAcceptsActions,
} from '@coploy/domain'
import type { Company, PostJob, StageAction } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { createCandidateTimelineService } from '@/lib/services/candidate-timeline-service'
import { createStageActionsRunner } from '@/lib/services/stage-actions-runner'
import { createOutboxWriter } from '@/lib/events/outbox-writer'
import { createEmailBrandingService } from '@/lib/services/email-branding-service'
import {
	createRejectionFeedbackEmailSender,
	type RejectionFeedbackEmailClient,
} from '@/lib/services/rejection-feedback-email'
import {
	mergeFeedbackRiskFlags,
	validateInternalRejectionNoteOrThrow,
} from '@/lib/services/feedback-guardrails'

/**
 * Ids reservados: ninguém cria nem apaga coluna com esse nome, porque são
 * etapas canônicas da régua (`PIPELINE_STAGES`) e o funil inteiro depende
 * delas pra significar a mesma coisa entre vagas.
 */
const RESERVED_COLUMN_IDS = PIPELINE_STAGE_IDS

/**
 * O que TODA configuração precisa conter. Fica nas 4 legadas de propósito:
 * exigir `applied`/`hired` quebraria na hora toda vaga que já tem
 * `kanbanConfig` salvo — a régua nova entra como default e por adoção, não
 * invalidando o que o cliente configurou.
 */
const REQUIRED_COLUMN_IDS = LEGACY_REQUIRED_STAGE_IDS

/** Régua padrão Coploy: quem nunca configurou já nasce no funil novo. */
const DEFAULT_KANBAN_CONFIG = {
	columns: PIPELINE_STAGES.map((stage) => ({ id: stage.id, order: stage.order })),
}

function generateColumnId(label: string): string {
	const slug = label
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')

	return `${slug}_${Date.now().toString(36)}`
}

function isRejectedStatus(status: string): boolean {
	return status.toLowerCase() === 'rejected'
}

function resolveRejectionReasonOrThrow(params: {
	candidateStatus: string
	rejectionReasonCode?: string
	rejectionNote?: string
}) {
	if (!isRejectedStatus(params.candidateStatus)) return null

	if (!params.rejectionReasonCode) {
		throw new BadRequestError('rejectionReasonCode is required when rejecting candidates')
	}

	const reason = findRejectionReason(params.rejectionReasonCode)
	if (!reason) {
		throw new BadRequestError(`Invalid rejectionReasonCode: ${params.rejectionReasonCode}`)
	}

	const note = params.rejectionNote?.trim()
	if (reason.requiresNote && !note) {
		throw new BadRequestError('rejectionNote is required for this rejection reason')
	}

	return {
		code: reason.code,
		label: reason.label,
		note,
	}
}

function resolveBulkRejectionFeedbackSentAtOrThrow(params: {
	candidateStatus: string
	rejectionFeedbackMessage?: string
	transitionCandidateIds: string[]
}) {
	if (!isRejectedStatus(params.candidateStatus)) return undefined
	if (params.transitionCandidateIds.length === 0) return undefined

	if (!params.rejectionFeedbackMessage?.trim()) {
		throw new BadRequestError(
			`rejectionFeedbackMessage is required when rejecting candidates: ${params.transitionCandidateIds.join(', ')}`,
		)
	}

	return undefined
}

export function createKanbanService(
	infra: InfraProvider,
	deps: { rejectionFeedbackEmailClient?: RejectionFeedbackEmailClient } = {},
) {
	const emailBranding = createEmailBrandingService(infra)
	const rejectionFeedbackEmailSender = createRejectionFeedbackEmailSender(
		deps.rejectionFeedbackEmailClient ?? createEmailSender(infra),
		createEmailTemplateResolver(infra),
	)
	const timelineService = createCandidateTimelineService(infra)
	const stageActionsRunner = createStageActionsRunner(infra)

	return {
		/**
		 * O que cada etapa dispara (V2-105).
		 *
		 * Devolve junto o catálogo de etapas e o de ações porque a tela precisa
		 * dos três para se montar — e assim a lista de ações válidas nasce do
		 * servidor, não de uma cópia no cliente que envelhece sozinha.
		 */
		async getStageActions(companyId: string) {
			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			const custom = (company?.kanbanCustomColumns ?? []).map((column) => ({
				id: column.id,
				label: column.label,
			}))
			const canonical = PIPELINE_STAGES.filter((stage) => stageAcceptsActions(stage.id)).map(
				(stage) => ({ id: stage.id, label: stage.label }),
			)
			return {
				actions: (company?.stageActions ?? {}) as Record<string, string[]>,
				stages: [...canonical, ...custom],
				available: [...STAGE_ACTIONS],
			}
		},

		/**
		 * Grava o mapa inteiro de uma vez.
		 *
		 * A tela edita várias etapas na mesma sessão e um PUT por etapa faria
		 * salvamento parcial ficar visível — metade das etapas com a regra nova e
		 * metade com a velha, sem ninguém saber qual.
		 */
		async saveStageActions(companyId: string, actions: Record<string, StageAction[]>) {
			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			if (!company) throw new BadRequestError('Company not found')

			const knownStages = new Set([
				...PIPELINE_STAGE_IDS,
				...(company.kanbanCustomColumns ?? []).map((column) => column.id),
			])

			const cleaned: Record<string, string[]> = {}
			for (const [stageId, list] of Object.entries(actions)) {
				const stage = normalizeStageId(stageId)
				if (!knownStages.has(stage)) {
					throw new BadRequestError(`Etapa desconhecida: ${stageId}`)
				}
				if (!stageAcceptsActions(stage)) {
					throw new BadRequestError(`A etapa ${stageId} não aceita ações`)
				}
				// lista vazia = etapa sem ação; some do mapa em vez de virar `[]`
				const unique = [...new Set(list)]
				if (unique.length > 0) cleaned[stage] = unique
			}

			await infra.companyRepository.updateCompany(companyId, { stageActions: cleaned })
			return cleaned
		},

		async getKanbanColumns(companyId: string) {
			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			return company?.kanbanCustomColumns ?? []
		},

		async createKanbanColumn(companyId: string, params: { label: string; color: string }) {
			const { label, color } = params
			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			if (!company) throw new BadRequestError('Company not found')

			const id = generateColumnId(label)

			if (RESERVED_COLUMN_IDS.includes(id)) {
				throw new BadRequestError('Cannot create a column with a reserved name')
			}

			const existingColumns = company.kanbanCustomColumns ?? []
			const duplicate = existingColumns.some(
				(col) => col.label.toLowerCase() === label.toLowerCase(),
			)

			if (duplicate) {
				throw new BadRequestError('A column with this label already exists in the catalog')
			}

			const newColumn = { id, label, color }
			const updatedColumns = [...existingColumns, newColumn]

			await infra.companyRepository.updateCompany(companyId, {
				kanbanCustomColumns: updatedColumns,
			})

			return newColumn
		},

		/**
		 * Renomear e recolorir coluna (V2-104).
		 *
		 * O `id` é IMUTÁVEL de propósito: ele é gerado do label na criação e é o
		 * que grava em `candidateStatus` de cada candidato. Regerar o id ao
		 * renomear órfãnaria todos os candidatos que já estão na coluna — por
		 * isso label é livre e id não muda.
		 *
		 * Colunas reservadas (a régua canônica) não são editáveis: o
		 * comportamento do funil, do SLA e dos relatórios depende delas.
		 */
		async updateKanbanColumn(
			companyId: string,
			columnId: string,
			params: { label?: string; color?: string },
		) {
			if (RESERVED_COLUMN_IDS.includes(columnId)) {
				throw new BadRequestError('Cannot edit a default kanban column')
			}

			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			if (!company) throw new BadRequestError('Company not found')

			const existingColumns = company.kanbanCustomColumns ?? []
			const target = existingColumns.find((col) => col.id === columnId)
			if (!target) throw new BadRequestError('Column not found in the catalog')

			const nextLabel = params.label?.trim() || target.label
			const duplicate = existingColumns.some(
				(col) => col.id !== columnId && col.label.toLowerCase() === nextLabel.toLowerCase(),
			)
			if (duplicate) {
				throw new BadRequestError('A column with this label already exists in the catalog')
			}

			const updated = existingColumns.map((col) =>
				col.id === columnId ? { ...col, label: nextLabel, color: params.color ?? col.color } : col,
			)

			await infra.companyRepository.updateCompany(companyId, { kanbanCustomColumns: updated })
			return updated.find((col) => col.id === columnId)!
		},

		async deleteKanbanColumn(companyId: string, columnId: string) {
			if (RESERVED_COLUMN_IDS.includes(columnId)) {
				throw new BadRequestError('Cannot delete a default kanban column')
			}

			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			if (!company) throw new BadRequestError('Company not found')

			const existingColumns = company.kanbanCustomColumns ?? []
			const filtered = existingColumns.filter((col) => col.id !== columnId)

			if (filtered.length === existingColumns.length) {
				throw new BadRequestError('Column not found in the catalog')
			}

			await infra.companyRepository.updateCompany(companyId, {
				kanbanCustomColumns: filtered,
			})
		},

		/**
		 * Devolve a configuração JÁ RESOLVIDA: além dos ids, o rótulo, a ordem e
		 * se a etapa encerra a jornada. O cliente pinta o que o servidor manda em
		 * vez de manter uma cópia da régua — `web/ats` não pode importar
		 * `@coploy/domain`  e duplicar isso viraria drift.
		 *
		 * `isDefault` alimenta a regra de adoção (design-fundacao §7): vaga que
		 * nunca configurou precisa de convite, não de silêncio.
		 */
		async getKanbanConfig(companyId: string, jobId: string) {
			const job = (await infra.jobRepository.getJob(companyId, jobId)) as PostJob | null
			if (!job) throw new BadRequestError('Job not found')

			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null
			const catalog = company?.kanbanCustomColumns ?? []
			const isDefault = !job.kanbanConfig
			/*
			 * "Já passou pela configuração?" é diferente de "usa a régua padrão".
			 *
			 * O convite de adoção pede duas coisas — ajustar etapas E definir o
			 * prazo de resposta. Como ele só olhava `kanbanConfig`, quem definia só
			 * o SLA continuava vendo o aviso para sempre; e quem acha a régua
			 * padrão boa (o caso comum, ela é boa) não tinha como satisfazê-lo.
			 * Qualquer um dos dois sinais já significa que a vaga foi configurada.
			 */
			const configured = Boolean(job.kanbanConfig) || Boolean(job.feedbackSlaHours)
			const kanbanConfig = job.kanbanConfig ?? DEFAULT_KANBAN_CONFIG

			const stages = kanbanConfig.columns
				.slice()
				.sort((a, b) => a.order - b.order)
				.map((column) => {
					const canonical = PIPELINE_STAGES.find((stage) => stage.id === column.id)
					const custom = catalog.find((entry) => entry.id === column.id)
					return {
						id: column.id,
						order: column.order,
						label: custom?.label ?? canonical?.label ?? column.id,
						labelEn: custom?.label ?? canonical?.labelEn ?? column.id,
						color: custom?.color ?? null,
						terminal: canonical?.terminal ?? false,
						offTrack: canonical?.offTrack ?? false,
						canonical: Boolean(canonical),
					}
				})

			return { ...kanbanConfig, isDefault, configured, stages }
		},

		async updateKanbanConfig(companyId: string, jobId: string, columns: Array<{ id: string; order: number }>) {
			const job = (await infra.jobRepository.getJob(companyId, jobId)) as PostJob | null
			if (!job) throw new BadRequestError('Job not found')

			const columnIds = columns.map((c) => c.id)

			/*
			 * Etapas configuráveis de verdade (V2-304).
			 *
			 * Antes o config exigia as QUATRO etapas legadas em toda vaga. Isso
			 * servia ao nosso funil, não ao processo do cliente: quem faz
			 * "candidatura → entrevista → decisão" era obrigado a manter
			 * "Selecionados" vazia no board, e quem tem processo longo não podia
			 * descrever o dele.
			 *
			 * O mínimo real é: uma ENTRADA (por onde o candidato chega) e ao menos
			 * um TERMINAL (onde o processo acaba). Sem entrada, ninguém entra; sem
			 * terminal, ninguém sai — e o anti-ghosting não teria o que medir.
			 */
			const hasEntry = columnIds.includes('applied') || columnIds.includes('pending')
			if (!hasEntry) {
				throw new BadRequestError(
					'O funil precisa de uma etapa de entrada ("applied" ou "pending")',
				)
			}

			const hasTerminal = ['approved', 'hired', 'rejected'].some((id) => columnIds.includes(id))
			if (!hasTerminal) {
				throw new BadRequestError(
					'O funil precisa de ao menos uma etapa terminal ("approved", "hired" ou "rejected")',
				)
			}

			/*
			 * Remover etapa que tem gente deixaria esses candidatos com um
			 * `candidateStatus` que não existe em coluna nenhuma — some do board sem
			 * ter sido movido, reprovado ou contratado. É perda silenciosa de
			 * candidato, o pior defeito possível num ATS.
			 */
			const previousIds = (job.kanbanConfig ?? DEFAULT_KANBAN_CONFIG).columns.map((c) => c.id)
			const removed = previousIds.filter((id) => !columnIds.includes(id))
			if (removed.length > 0) {
				/*
				 * Falha ao LER candidatos não pode virar bloqueio de configuração: o
				 * recrutador ficaria impedido de mexer no funil por uma leitura
				 * instável. Sem lista, segue — travar a tela é pior que o risco.
				 */
				const raw = await Promise.resolve(
					infra.candidateRepository.listJobInterviews(companyId, jobId, { limitTo: 500 }),
				).catch(() => [])
				const interviews = (Array.isArray(raw) ? raw : []) as unknown as Array<
					Record<string, unknown>
				>

				const occupied = removed.filter((stageId) =>
					interviews.some(
						(item) =>
							normalizeStageId(
								(item.candidateStatus ?? item.candidate_status) as string | undefined,
							) === normalizeStageId(stageId),
					),
				)

				if (occupied.length > 0) {
					throw new BadRequestError(
						`Mova os candidatos antes de remover: ${occupied.join(', ')}`,
					)
				}
			}

			// A entrada do funil é `applied` na régua nova e `pending` na legada —
			// aceitar as duas é o que deixa cliente antigo e novo conviverem.
			const entry = columns.slice().sort((a, b) => a.order - b.order)[0]
			if (!entry || (entry.id !== 'applied' && entry.id !== 'pending')) {
				throw new BadRequestError(
					'The first column must be the funnel entry ("applied" or "pending")',
				)
			}

			const kanbanConfig = { columns }
			await infra.jobRepository.updateJob(companyId, jobId, { kanbanConfig })
			return kanbanConfig
		},

		async bulkUpdateStatus(params: {
			companyId: string
			candidateIds: string[]
			candidateStatus: string
			postJobId: string
			rejectionReasonCode?: string
			rejectionNote?: string
			rejectionEmailSentAt?: string
			rejectionFeedbackMessage?: string
			rejectedByUserId?: string
			/** Quem moveu — gravado no histórico junto com o evento. */
			actorName?: string | null
		}) {
			const {
				companyId,
				candidateIds,
				candidateStatus,
				postJobId,
				rejectionReasonCode,
				rejectionNote,
				rejectionFeedbackMessage,
				rejectedByUserId,
				actorName,
			} = params
			const rejectionReason = resolveRejectionReasonOrThrow({
				candidateStatus,
				rejectionReasonCode,
				rejectionNote,
			})
			const rejectionNoteGuardrails = rejectionReason?.note
				? validateInternalRejectionNoteOrThrow(rejectionReason.note)
				: null
			const now = new Date().toISOString()
			const dateSelectTimestamp = new Date()

			const results: Array<{ candidateId: string; success: boolean; error?: string }> = []
			const interviews = await Promise.all(
				candidateIds.map(async (candidateId) => ({
					candidateId,
					interview: await infra.candidateRepository.getJobInterview(companyId, postJobId, candidateId),
				})),
			)
			const missingIds = interviews
				.filter((item) => !item.interview)
				.map((item) => item.candidateId)

			if (missingIds.length > 0) {
				throw new BadRequestError(`Interview not found for candidateIds: ${missingIds.join(', ')}`)
			}

			const transitionCandidateIds = interviews
				.filter(
					(item) =>
						isRejectedStatus(candidateStatus) &&
						!isRejectedStatus((item.interview as { candidateStatus?: string | null }).candidateStatus || ''),
				)
				.map((item) => item.candidateId)

			const rejectionFeedbackSentAt = resolveBulkRejectionFeedbackSentAtOrThrow({
				candidateStatus,
				rejectionFeedbackMessage,
				transitionCandidateIds,
			})
			const company = transitionCandidateIds.length > 0
				? (await infra.companyRepository.getCompany(companyId)) as Company | null
				: null
			const feedbackSentAtByCandidateId = new Map<string, Date>()
			const feedbackRiskFlagsByCandidateId = new Map<string, string[]>()

			if (rejectionFeedbackMessage && transitionCandidateIds.length > 0) {
				await Promise.all(
					interviews
						.filter((item) => transitionCandidateIds.includes(item.candidateId))
						.map(async ({ candidateId, interview }) => {
							const jobAppliedRef = (interview as { job_applied_ref?: { id?: string | null; path?: string | null } | null }).job_applied_ref
							const jobAppliedId = jobAppliedRef?.id || jobAppliedRef?.path?.split('/').pop() || candidateId
							const sent = await rejectionFeedbackEmailSender.send({
								candidate: {
									email: (interview as { email?: string | null }).email,
									name: (interview as { name?: string | null }).name,
								},
								message: rejectionFeedbackMessage,
								jobName:
									(interview as { jobName?: string | null }).jobName ||
									(interview as { job_name?: string | null }).job_name ||
									null,
								companyName: company?.companyName ?? null,
								companyId,
								jobId: postJobId,
								jobAppliedId,
								language: (interview as { language?: string | null }).language ?? null,
								rejectionDecisionSource: 'bulk',
								// marca da EMPRESA no e-mail do candidato 
								branding: await emailBranding.forCompanyId(companyId),
							})
							feedbackSentAtByCandidateId.set(candidateId, sent.sentAt)
							feedbackRiskFlagsByCandidateId.set(candidateId, sent.riskFlags)
						}),
				)
			}

			await Promise.all(
				interviews.map(async ({ candidateId, interview }) => {
					try {
						const persistedRejectionFeedbackSentAt =
							feedbackSentAtByCandidateId.get(candidateId) ?? rejectionFeedbackSentAt
						const riskFlags = mergeFeedbackRiskFlags(
							(interview as { rejectionRiskFlags?: string[] | null }).rejectionRiskFlags ?? null,
							feedbackRiskFlagsByCandidateId.get(candidateId),
							rejectionNoteGuardrails?.riskFlags,
						)
						const updateData = {
							candidate_status: candidateStatus,
							candidateStatus,
							date_select: dateSelectTimestamp,
							dateSelect: dateSelectTimestamp,
							updated_at: now,
							...(rejectionReason && {
								rejectionReasonCode: rejectionReason.code,
								rejectionReasonLabel: rejectionReason.label,
								rejectionDecisionSource: 'bulk' as const,
								rejectionDecidedByUserId: rejectedByUserId ?? null,
								rejectionTaxonomyVersion: REJECTION_REASON_TAXONOMY_VERSION,
								rejectionEvidence: null,
								...(rejectionReason.note ? { rejectionNote: rejectionReason.note } : {}),
							}),
							...(persistedRejectionFeedbackSentAt
								? {
										rejectionFeedbackSentAt: persistedRejectionFeedbackSentAt,
									}
								: {}),
							...((rejectionReason || persistedRejectionFeedbackSentAt)
								? { rejectionRiskFlags: riskFlags.length ? riskFlags : null }
								: {}),
						}

						await infra.candidateRepository.updateJobInterview(companyId, postJobId, candidateId, updateData)
						await infra.candidateRepository.updateCompanyInterview(companyId, candidateId, updateData)

						const userRefPath = (interview as unknown as Record<string, unknown>).user_ref as { path?: string } | undefined
						const jobAppliedRefPath = (interview as unknown as Record<string, unknown>).job_applied_ref as { path?: string } | undefined
						const userUid = userRefPath?.path?.split('/').pop()
						const jobAppliedId = jobAppliedRefPath?.path?.split('/').pop()

						if (userUid && jobAppliedId) {
							await infra.candidateRepository.updateJobApplied(userUid, jobAppliedId, {
								candidateStatus,
								dateSelect: dateSelectTimestamp,
								updated_at: now,
								...(rejectionReason && {
									rejectionReasonCode: rejectionReason.code,
									rejectionReasonLabel: rejectionReason.label,
									rejectionDecisionSource: 'bulk' as const,
									rejectionDecidedByUserId: rejectedByUserId ?? null,
									rejectionTaxonomyVersion: REJECTION_REASON_TAXONOMY_VERSION,
									rejectionEvidence: null,
									...(rejectionReason.note ? { rejectionNote: rejectionReason.note } : {}),
								}),
								...(persistedRejectionFeedbackSentAt
									? {
											rejectionFeedbackSentAt: persistedRejectionFeedbackSentAt,
										}
									: {}),
								...((rejectionReason || persistedRejectionFeedbackSentAt)
									? { rejectionRiskFlags: riskFlags.length ? riskFlags : null }
									: {}),
							})
						}

						/*
						 * Timeline (V2-303): a mudança de etapa vira registro legível.
						 *
						 * Depois da escrita e fora de transação de propósito — histórico
						 * não pode derrubar a movimentação do candidato, que é a operação
						 * que o recrutador de fato pediu.
						 */
						void timelineService.recordEvent({
							companyId,
							jobId: postJobId,
							candidateId,
							type: 'stage_changed',
							body: rejectionReason?.label ?? null,
							metadata: {
								to: candidateStatus,
								source: 'bulk',
								...(rejectionReason ? { reasonCode: rejectionReason.code } : {}),
							},
							authorId: rejectedByUserId ?? null,
							authorName: actorName ?? null,
						})

						if (rejectionReason) {
							try {
								await createOutboxWriter(infra).write({
									type: 'candidatura_reprovada',
									companyId,
									payload: {
										applicationId: jobAppliedId || candidateId,
										jobId: postJobId,
										rejectionReasonCode: rejectionReason.code,
										rejectionReasonLabel: rejectionReason.label,
										rejectedByUserId,
										occurredAt: now,
									},
								})
							} catch (error) {
								console.error('[Kanban] failed to write candidatura_reprovada event:', error)
							}
						}

						if (persistedRejectionFeedbackSentAt) {
							try {
								await createOutboxWriter(infra).write({
									type: 'feedback_enviado',
									companyId,
									payload: {
										applicationId: jobAppliedId || candidateId,
										jobId: postJobId,
										channel: 'email',
										sentAt: persistedRejectionFeedbackSentAt.toISOString(),
										occurredAt: now,
									},
								})
							} catch (error) {
								console.error('[Kanban] failed to write feedback_enviado event:', error)
							}
						}

						results.push({ candidateId, success: true })
					} catch (error) {
						results.push({
							candidateId,
							success: false,
							error: error instanceof Error ? error.message : 'Unknown error',
						})
					}
				}),
			)

			const successCount = results.filter((r) => r.success).length

			/*
			 * Ações da etapa (V2-105) — depois da escrita e só para quem ENTROU.
			 *
			 * Quem já estava na etapa fica de fora: senão um bulk de manutenção
			 * mandaria convite para a coluna inteira. E o `await` é proposital
			 * mesmo sem afetar a resposta: soltar a promessa faria o processo
			 * poder morrer no meio de um envio, sem log nem registro.
			 */
			const entered = interviews
				.filter(
					({ candidateId, interview }) =>
						normalizeStageId(
							(interview as { candidateStatus?: string | null }).candidateStatus,
						) !== normalizeStageId(candidateStatus) &&
						results.some((result) => result.candidateId === candidateId && result.success),
				)
				.map((item) => item.candidateId)

			await stageActionsRunner.run({
				companyId,
				jobId: postJobId,
				stageId: candidateStatus,
				candidateIds: entered,
				actorId: rejectedByUserId,
			})

			return {
				message: `${successCount} of ${candidateIds.length} candidates updated successfully`,
				results,
			}
		},
	}
}
