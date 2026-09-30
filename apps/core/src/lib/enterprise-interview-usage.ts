import type { CompanyInterview } from '@coploy/domain'

/**
 * Contagem de entrevistas finalizadas no período — mesma regra da fatura
 * Enterprise (`admin-enterprise-payment-service` / buildPreview).
 * Não duplicar esta lógica em outro lugar.
 */

export function isFinishedInterview(i: CompanyInterview): boolean {
	const finished = (i as { finished?: boolean | null }).finished
	const finishLegacy = (i as { finish?: boolean | null }).finish
	return !!finished || !!finishLegacy
}

/** 'YYYY-MM' → [primeiro dia 00:00 UTC, primeiro dia do mês seguinte) */
export function periodBounds(period: string): { startMs: number; endMs: number } {
	const [yearStr, monthStr] = period.split('-')
	const year = Number.parseInt(yearStr, 10)
	const month = Number.parseInt(monthStr, 10) - 1
	const startMs = Date.UTC(year, month, 1)
	const endMs = Date.UTC(year, month + 1, 1)
	return { startMs, endMs }
}

/** Período de faturamento corrente em UTC ('YYYY-MM'). */
export function currentBillingPeriod(now: Date = new Date()): string {
	const y = now.getUTCFullYear()
	const m = String(now.getUTCMonth() + 1).padStart(2, '0')
	return `${y}-${m}`
}

export function countFinishedInterviewsInPeriod(
	interviews: CompanyInterview[],
	period: string,
): number {
	const { startMs, endMs } = periodBounds(period)
	let count = 0
	for (const i of interviews) {
		const date = i.date instanceof Date ? i.date : null
		if (!date) continue
		const ms = date.getTime()
		if (ms < startMs || ms >= endMs) continue
		if (!isFinishedInterview(i)) continue
		count++
	}
	return count
}

export function computeOverageQuantity(
	interviewsUsed: number,
	interviewsQuota: number | null,
): number {
	if (interviewsQuota === null) return 0
	return Math.max(0, interviewsUsed - interviewsQuota)
}
