import type { Company } from '@coploy/domain'

type CompanyLike = Pick<Company, 'subscriptionTrial'> | null | undefined
type DateLike = Date | string | number | null | undefined

function parseDate(raw: DateLike): Date | null {
	if (!raw) return null
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
	const parsed = new Date(raw as string | number)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * SaaS courtesy rule: company interviews finished BEFORE
 * `subscriptionTrial.startAt` are exposed in full (score + content) as a
 * pre-onboarding courtesy. Interviews at/after `startAt`, or any interview
 * when `startAt` is missing, fall back to the SaaS lock (credit required).
 *
 * Replaces the legacy "first finished interview" exception (pre 2026-06-15).
 *
 * The rule applies ONLY to the viewer company's own interviews — hunting
 * (other-company interviews) uses Opção A teaser regardless of dates.
 */
export function isCourtesyInterview(
	company: CompanyLike,
	interviewDate: DateLike,
): boolean {
	const startAt = parseDate(company?.subscriptionTrial?.startAt as DateLike)
	if (!startAt) return false
	const date = parseDate(interviewDate)
	if (!date) return false
	return date.getTime() < startAt.getTime()
}

export function pickInterviewDate(job: Record<string, unknown> | null | undefined): Date | null {
	if (!job) return null
	const interview = job.interview as Record<string, unknown> | null | undefined
	return parseDate(
		(job.finishedTime as DateLike) ??
			(job.appliedTime as DateLike) ??
			(interview?.dateTime as DateLike) ??
			(interview?.date as DateLike) ??
			null,
	)
}
