import { useMemo } from 'react'

import { empresa } from '@coploy/sdk/react'

import { CANONICAL_STAGES, stageFill, stageLabel } from '@/features/jobs/stages'

export interface PipelineStageView {
	id: string
	order: number
	label: string
	labelEn: string
	terminal: boolean
	offTrack: boolean
	canonical: boolean
	/** Classe de fill da etapa — cor é vocabulário, não decoração. */
	fill: string
}

/**
 * Régua da vaga vinda do servidor.
 *
 * O `kanban-config` devolve as etapas JÁ RESOLVIDAS (rótulo, ordem, se
 * encerra a jornada), então o cliente não guarda cópia da régua — `web/ats`
 * não pode importar `@coploy/domain`  e duplicar isso viraria drift
 * num vocabulário que o funil inteiro depende.
 *
 * `configured` é o gatilho da regra de adoção (design-fundacao §7): vaga que
 * nunca configurou merece convite, não silêncio.
 *
 * O fallback local existe porque o core em produção pode estar atrás do
 * cliente — aí a tela ainda abre com a régua canônica em vez de vazia.
 */
export function usePipelineStages(jobId: string, t: (key: string) => string) {
	const { data, isLoading } = empresa.useGetCompaniesJobsJobIdKanbanConfig(jobId, {
		query: { enabled: Boolean(jobId) },
	})

	return useMemo(() => {
		const payload = data?.data.kanbanConfig
		const fromServer = payload?.stages

		if (fromServer && fromServer.length > 0) {
			return {
				stages: fromServer.map((stage) => ({
					...stage,
					/*
					 * Rótulo de etapa CANÔNICA vem do stageLabel, não do servidor: o
					 * servidor manda pt fixo (e 'Entrevista IA' mesmo sem Motor) — o
					 * cliente é quem sabe o idioma do usuário e a edição. Etapa
					 * própria da empresa mantém o nome que ela digitou.
					 */
					label: (CANONICAL_STAGES as readonly string[]).includes(stage.id)
						? stageLabel(stage.id, t)
						: stage.label,
					fill: stageFill(stage.id),
				})) satisfies PipelineStageView[],
				isDefault: payload?.isDefault === true,
				configured: payload?.configured === true,
				isLoading,
			}
		}

		return {
			stages: CANONICAL_STAGES.map((id, order) => ({
				id,
				order,
				label: stageLabel(id, t),
				labelEn: id,
				terminal: id === 'approved' || id === 'hired' || id === 'rejected',
				offTrack: id === 'rejected',
				canonical: true,
				fill: stageFill(id),
			})) satisfies PipelineStageView[],
			isDefault: true,
			configured: false,
			isLoading,
		}
	}, [data, isLoading, t])
}
