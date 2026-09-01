import type { JobRequisition, RequisitionStatus } from '@coploy/domain'
import { canCreateJobFrom } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

/**
 * Requisição de vaga com aprovação (V2-401).
 *
 * Em empresa média ninguém publica vaga sozinho: o gestor requisita, o RH ou a
 * diretoria aprova. Hoje isso acontece em e-mail e planilha, e a Coploy só entra
 * quando a decisão já foi tomada em outro lugar.
 *
 * ⚠️ Exigir requisição é **opt-in por empresa** (`featureFlags.jobRequisition`).
 * Ligar para todo mundo transformaria criar vaga — hoje um clique — numa
 * burocracia que a empresa pequena não pediu.
 */
export function createJobRequisitionService(infra: InfraProvider) {
	/*
	 * Closure e não método do objeto: `const { linkJob } = service` perderia o
	 * `this` e o guard sumiria em silêncio — já aconteceu no insights-service.
	 */
	async function assertUsable(params: { companyId: string; requisitionId: string }) {
		const requisition = await infra.jobRequisitionRepository.getRequisition(
			params.companyId,
			params.requisitionId,
		)
		if (!requisition) throw new NotFoundError('Requisição não encontrada')
		if (!canCreateJobFrom(requisition)) {
			throw new BadRequestError(
				requisition.jobId
					? 'Esta requisição já gerou uma vaga'
					: 'A requisição precisa estar aprovada',
			)
		}
		return requisition
	}

	return {
		async listRequisitions(params: { companyId: string; status?: RequisitionStatus }) {
			const requisitions = await infra.jobRequisitionRepository.listRequisitions(
				params.companyId,
				params.status,
			)
			/*
			 * Preenchimento DERIVADO, nunca gravado (item 6 da revisão da open):
			 * contratados na vaga ligada × headcount pedido. Derivar evita o
			 * estado divergir quando uma contratação é desfeita — o número é
			 * sempre o retrato atual do pipeline. Falha na contagem degrada pra
			 * null (a tela mostra a requisição sem o contador), não pra erro.
			 */
			const enriched = await Promise.all(
				requisitions.map(async (requisition) => {
					if (!requisition.jobId) {
						return { ...requisition, hiredCount: null as number | null, fulfilled: false }
					}
					const hiredCount = await infra.candidateRepository
						.listCompanyInterviews(params.companyId, {
							filters: [{ field: 'job_ref.id', operator: '==', value: requisition.jobId }],
						})
						.then(
							(interviews) =>
								(interviews as Array<{ candidateStatus?: string | null }>).filter(
									(item) => (item.candidateStatus ?? '').toLowerCase() === 'hired',
								).length,
						)
						.catch(() => null)
					return {
						...requisition,
						hiredCount,
						fulfilled: hiredCount !== null && hiredCount >= requisition.headcount,
					}
				}),
			)
			return { requisitions: enriched }
		},

		async createRequisition(params: {
			companyId: string
			title: string
			area?: string | null
			reason?: string | null
			headcount?: number
			salaryRangeMin?: number | null
			salaryRangeMax?: number | null
			currency?: string | null
			requestedByUserId: string
			requestedByName?: string | null
		}): Promise<JobRequisition> {
			const title = params.title.trim()
			if (!title) throw new BadRequestError('Informe o cargo pretendido')

			const headcount = params.headcount ?? 1
			if (headcount < 1) throw new BadRequestError('Headcount mínimo é 1')

			if (
				params.salaryRangeMin != null &&
				params.salaryRangeMax != null &&
				params.salaryRangeMin > params.salaryRangeMax
			) {
				throw new BadRequestError('Faixa salarial invertida')
			}

			return infra.jobRequisitionRepository.createRequisition(params.companyId, {
				companyId: params.companyId,
				title,
				area: params.area ?? null,
				reason: params.reason ?? null,
				headcount,
				salaryRangeMin: params.salaryRangeMin ?? null,
				salaryRangeMax: params.salaryRangeMax ?? null,
				currency: params.currency ?? 'BRL',
				requestedByUserId: params.requestedByUserId,
				requestedByName: params.requestedByName ?? null,
				status: 'pending',
			} as never)
		},

		/**
		 * Aprovar ou recusar.
		 *
		 * Recusa EXIGE justificativa — pela mesma razão que reprovar candidato
		 * exige motivo: decisão sem explicação é a origem do ruído que o produto
		 * inteiro tenta eliminar, e quem requisitou precisa saber o que mudar para
		 * pedir de novo.
		 */
		async decide(params: {
			companyId: string
			requisitionId: string
			decision: 'approved' | 'rejected'
			decidedByUserId: string
			decidedByName?: string | null
			note?: string | null
		}): Promise<JobRequisition> {
			const requisition = await infra.jobRequisitionRepository.getRequisition(
				params.companyId,
				params.requisitionId,
			)
			if (!requisition) throw new NotFoundError('Requisição não encontrada')

			if (requisition.status !== 'pending') {
				throw new BadRequestError('Esta requisição já foi decidida')
			}
			if (params.decision === 'rejected' && !params.note?.trim()) {
				throw new BadRequestError('Explique o motivo da recusa')
			}

			const decidedAt = new Date()
			await infra.jobRequisitionRepository.updateRequisition(
				params.companyId,
				params.requisitionId,
				{
					status: params.decision,
					decidedByUserId: params.decidedByUserId,
					decidedByName: params.decidedByName ?? null,
					decidedAt,
					decisionNote: params.note?.trim() ?? null,
				} as never,
			)

			return {
				...requisition,
				status: params.decision,
				decidedByUserId: params.decidedByUserId,
				decidedByName: params.decidedByName ?? null,
				decidedAt,
				decisionNote: params.note?.trim() ?? null,
			}
		},

		/**
		 * A empresa exige requisição aprovada para publicar?
		 *
		 * Consultado na criação de vaga. Empresa sem a flag segue criando vaga em
		 * um clique — retrocompatibilidade é o padrão, não a exceção.
		 */
		async requiresRequisition(companyId: string): Promise<boolean> {
			const company = (await infra.companyRepository.getCompany(companyId).catch(() => null)) as {
				featureFlags?: Record<string, boolean>
			} | null
			return company?.featureFlags?.jobRequisition === true
		},

		/**
		 * A requisição pode virar vaga?
		 *
		 * Separado de `linkJob` porque a validação precisa acontecer ANTES de a
		 * vaga ser criada: recusar depois deixaria uma vaga órfã no lugar de uma
		 * mensagem de erro.
		 */
		assertUsable,
		/** Marca a requisição como consumida — uma requisição gera uma vaga. */
		async linkJob(params: { companyId: string; requisitionId: string; jobId: string }) {
			await assertUsable(params)
			await infra.jobRequisitionRepository.updateRequisition(
				params.companyId,
				params.requisitionId,
				{ jobId: params.jobId } as never,
			)
		},
	}
}
