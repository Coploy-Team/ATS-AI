import { isTerminalStage, type CompanyInterview } from '@coploy/domain'
import { ANTI_GHOSTING_CONFIG } from '@/lib/services/anti-ghosting-config'

const MS_PER_HOUR = 60 * 60 * 1000

export type SlaMetrics = {
	activeCount: number
	overdueWithoutDecisionCount: number
	ratio: number
	isIrregular: boolean
}

export function isTerminalDecisionStatus(status?: string | null): boolean {
	// A régua canônica é a fonte: contratado também encerra a jornada, senão
	// quem foi contratado seguia contando como "esperando resposta" no SLA.
	if (!status?.trim()) return false
	return isTerminalStage(status)
}

export function resolveAppliedAt(interview: Pick<CompanyInterview, 'date'>): Date | null {
	const raw = interview.date
	if (!raw) return null
	const date = raw instanceof Date ? raw : new Date(raw)
	return Number.isNaN(date.getTime()) ? null : date
}

export function isPastSla(appliedAt: Date, slaHours: number, now: Date): boolean {
	return now.getTime() - appliedAt.getTime() > slaHours * MS_PER_HOUR
}

export function computeSlaMetrics(
	interviews: Array<Pick<CompanyInterview, 'candidateStatus' | 'date'>>,
	slaHours: number,
	now: Date = new Date(),
	thresholdRatio: number = ANTI_GHOSTING_CONFIG.irregularityThresholdRatio,
): SlaMetrics {
	let activeCount = 0
	let overdueWithoutDecisionCount = 0

	for (const interview of interviews) {
		if (isTerminalDecisionStatus(interview.candidateStatus)) continue
		activeCount += 1
		const appliedAt = resolveAppliedAt(interview)
		if (appliedAt && isPastSla(appliedAt, slaHours, now)) {
			overdueWithoutDecisionCount += 1
		}
	}

	const ratio = activeCount === 0 ? 0 : overdueWithoutDecisionCount / activeCount
	return {
		activeCount,
		overdueWithoutDecisionCount,
		ratio,
		isIrregular: ratio > thresholdRatio,
	}
}

export function isGracePeriodExpired(
	irregularSince: Date,
	now: Date = new Date(),
	gracePeriodHours: number = ANTI_GHOSTING_CONFIG.gracePeriodHours,
): boolean {
	return now.getTime() - irregularSince.getTime() >= gracePeriodHours * MS_PER_HOUR
}
