/**
 * Configuração do anti-ghosting SLA (TOS-026).
 * Valores de produto — nunca hardcode espalhado no fluxo.
 */
export const ANTI_GHOSTING_CONFIG = {
	/** Default de `PostJob.feedbackSlaHours` em vagas novas. */
	defaultFeedbackSlaHours: 24,
	/** Default de `PostJob.antiGhostingEnabled` em vagas novas. */
	defaultAntiGhostingEnabled: true,
	/**
	 * Limiar de irregularidade: fração de candidaturas ATIVAS paradas
	 * sem decisão além do SLA. Irregular só quando estritamente acima.
	 */
	irregularityThresholdRatio: 0.3,
	/** Carência entre alerta e auto-`stopped` (horas). */
	gracePeriodHours: 48,
} as const
