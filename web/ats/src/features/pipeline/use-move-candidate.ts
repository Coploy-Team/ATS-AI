import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { empresa } from '@coploy/sdk/react'

export interface MoveArgs {
	candidateId: string
	toStage: string
	rejection?: {
		reasonCode: string
		note?: string
		feedbackMessage?: string
	}
}

/** Shape mínimo do cache que o board escreve — o resto do DTO passa intacto. */
type CandidatesCache = {
	data?: {
		candidates?: Array<{ id: string; candidateStatus?: string; date_select?: string }>
	}
}

/**
 * Move candidato de etapa com UPDATE OTIMISTA e rollback no erro.
 *
 * Por que otimista e não `invalidate` seco: o board carrega até 200 candidatos
 * numa query só. Esperar o round-trip + refetch faz o card "voltar" pra coluna
 * antiga por ~1s e parece bug. Escrevemos no cache na hora e só revalidamos
 * depois que o servidor confirma.
 *
 * `date_select` também é atualizado no cache porque é ele que alimenta o
 * "parado há X dias" — sem isso o card chegaria na coluna nova já com o
 * relógio da etapa anterior.
 *
 * Bulk usa o endpoint dedicado (`bulk-status`, até 50 por chamada) em vez de
 * N requests — a API já resolve numa transação só.
 */
export function useMoveCandidate(jobId: string, params?: Record<string, string>) {
	const queryClient = useQueryClient()
	const [pending, setPending] = useState<Set<string>>(new Set())

	const single = empresa.usePatchCompaniesInterviewsId()
	const bulk = empresa.usePatchCompaniesInterviewsBulkStatus()

	/*
	 * ⚠️ A chave TEM que ser a mesma da query do board, parâmetros incluídos.
	 *
	 * Quando a ordenação entrou (V2-105), a query passou a levar `orderBy` e
	 * `orderDirection` e esta chave continuou só com `limit` — o update otimista
	 * escrevia num cache que ninguém lia, e o card voltava para a coluna antiga
	 * até o refetch. Por isso os params vêm de fora, de quem faz a query.
	 */
	const candidatesKey = empresa.getGetCompaniesJobsJobIdCandidatesQueryKey(
		jobId,
		params ?? { limit: '200' },
	)

	/** Aplica o movimento no cache e devolve o snapshot pro rollback. */
	async function applyOptimistic(ids: string[], toStage: string) {
		await queryClient.cancelQueries({ queryKey: candidatesKey })
		const snapshot = queryClient.getQueryData<CandidatesCache>(candidatesKey)
		const now = new Date().toISOString()

		queryClient.setQueryData<CandidatesCache>(candidatesKey, (current) => {
			if (!current?.data?.candidates) return current
			return {
				...current,
				data: {
					...current.data,
					candidates: current.data.candidates.map((candidate) =>
						ids.includes(candidate.id)
							? { ...candidate, candidateStatus: toStage, date_select: now }
							: candidate,
					),
				},
			}
		})

		return snapshot
	}

	function rollback(snapshot: CandidatesCache | undefined) {
		if (snapshot) queryClient.setQueryData(candidatesKey, snapshot)
	}

	async function settle() {
		await queryClient.invalidateQueries({ queryKey: candidatesKey })
		// a lista de vagas mostra contagem/trilha por etapa — move muda os dois
		await queryClient.invalidateQueries({
			queryKey: empresa.getGetCompaniesJobsQueryKey(),
			exact: false,
		})
	}

	function markPending(ids: string[], on: boolean) {
		setPending((current) => {
			const next = new Set(current)
			for (const id of ids) (on ? next.add(id) : next.delete(id))
			return next
		})
	}

	/** @returns `true` quando o servidor confirmou; `false` após rollback. */
	async function move({ candidateId, toStage, rejection }: MoveArgs) {
		markPending([candidateId], true)
		const snapshot = await applyOptimistic([candidateId], toStage)
		try {
			await single.mutateAsync({
				id: candidateId,
				data: {
					candidate_status: toStage,
					postJobId: jobId,
					...(rejection && {
						rejectionReasonCode: rejection.reasonCode,
						...(rejection.note ? { rejectionNote: rejection.note } : {}),
						...(rejection.feedbackMessage
							? { rejectionFeedbackMessage: rejection.feedbackMessage }
							: {}),
					}),
				},
			})
			await settle()
			return true
		} catch {
			// o card volta pra coluna de origem; o erro vira aviso na página
			rollback(snapshot)
			return false
		} finally {
			markPending([candidateId], false)
		}
	}

	/** @returns `true` quando o servidor confirmou; `false` após rollback. */
	async function moveMany(
		candidateIds: string[],
		toStage: string,
		rejection?: MoveArgs['rejection'],
	) {
		if (candidateIds.length === 0) return true
		markPending(candidateIds, true)
		const snapshot = await applyOptimistic(candidateIds, toStage)
		try {
			// a API aceita no máximo 50 por chamada — fatiar é responsabilidade nossa
			for (let i = 0; i < candidateIds.length; i += 50) {
				await bulk.mutateAsync({
					data: {
						candidateIds: candidateIds.slice(i, i + 50),
						candidate_status: toStage,
						postJobId: jobId,
						...(rejection && {
							rejectionReasonCode: rejection.reasonCode,
							...(rejection.note ? { rejectionNote: rejection.note } : {}),
							...(rejection.feedbackMessage
								? { rejectionFeedbackMessage: rejection.feedbackMessage }
								: {}),
						}),
					},
				})
			}
			await settle()
			return true
		} catch {
			rollback(snapshot)
			return false
		} finally {
			markPending(candidateIds, false)
		}
	}

	/**
	 * Move só no cache, sem chamar o servidor — base do undo.
	 *
	 * Permite que o card saia da coluna na hora enquanto a janela de desfazer
	 * corre. Devolve a função de rollback: desfazer é restaurar o snapshot, e
	 * como nada foi enviado, nenhum e-mail saiu.
	 */
	async function stageLocally(ids: string[], toStage: string) {
		const snapshot = await applyOptimistic(ids, toStage)
		return () => rollback(snapshot)
	}

	return {
		move,
		moveMany,
		stageLocally,
		pending,
		isMoving: single.isPending || bulk.isPending,
	}
}
