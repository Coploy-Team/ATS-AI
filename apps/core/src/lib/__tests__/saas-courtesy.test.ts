import { isCourtesyInterview, pickInterviewDate } from '../saas-courtesy'

describe('isCourtesyInterview', () => {
	const START_AT = new Date('2024-06-01T00:00:00.000Z')
	const BEFORE = new Date('2024-05-15T10:00:00.000Z')
	const AT = START_AT
	const AFTER = new Date('2024-07-01T10:00:00.000Z')

	it('returns true when interview date < subscriptionTrial.startAt', () => {
		expect(
			isCourtesyInterview({ subscriptionTrial: { startAt: START_AT } }, BEFORE),
		).toBe(true)
	})

	it('returns false when interview date == subscriptionTrial.startAt (exclusive cutoff)', () => {
		expect(
			isCourtesyInterview({ subscriptionTrial: { startAt: START_AT } }, AT),
		).toBe(false)
	})

	it('returns false when interview date > subscriptionTrial.startAt', () => {
		expect(
			isCourtesyInterview({ subscriptionTrial: { startAt: START_AT } }, AFTER),
		).toBe(false)
	})

	it('returns false when company has no subscriptionTrial', () => {
		expect(isCourtesyInterview({ subscriptionTrial: null }, BEFORE)).toBe(false)
	})

	it('returns false when company has no startAt inside subscriptionTrial', () => {
		expect(
			isCourtesyInterview({ subscriptionTrial: { startAt: null } }, BEFORE),
		).toBe(false)
	})

	it('returns false when company is null/undefined', () => {
		expect(isCourtesyInterview(null, BEFORE)).toBe(false)
		expect(isCourtesyInterview(undefined, BEFORE)).toBe(false)
	})

	it('returns false when interview date is null/invalid', () => {
		expect(
			isCourtesyInterview({ subscriptionTrial: { startAt: START_AT } }, null),
		).toBe(false)
		expect(
			isCourtesyInterview(
				{ subscriptionTrial: { startAt: START_AT } },
				'not-a-date',
			),
		).toBe(false)
	})

	it('accepts ISO strings for both fields', () => {
		expect(
			isCourtesyInterview(
				{ subscriptionTrial: { startAt: START_AT.toISOString() as any } },
				BEFORE.toISOString(),
			),
		).toBe(true)
	})
})

describe('pickInterviewDate', () => {
	it('returns null when job is null/undefined', () => {
		expect(pickInterviewDate(null)).toBeNull()
		expect(pickInterviewDate(undefined)).toBeNull()
	})

	it('prefers finishedTime over appliedTime', () => {
		const result = pickInterviewDate({
			finishedTime: '2024-04-03T11:00:00.000Z',
			appliedTime: '2024-04-01T11:00:00.000Z',
		})
		expect(result?.toISOString()).toBe('2024-04-03T11:00:00.000Z')
	})

	it('falls back to interview.dateTime when timestamps are missing', () => {
		const result = pickInterviewDate({
			interview: { dateTime: '2024-04-03T11:00:00.000Z' },
		})
		expect(result?.toISOString()).toBe('2024-04-03T11:00:00.000Z')
	})

	it('falls back to interview.date as last resort', () => {
		const result = pickInterviewDate({
			interview: { date: '2024-04-03T11:00:00.000Z' },
		})
		expect(result?.toISOString()).toBe('2024-04-03T11:00:00.000Z')
	})

	it('returns null when no usable timestamp exists', () => {
		expect(pickInterviewDate({})).toBeNull()
		expect(pickInterviewDate({ interview: {} })).toBeNull()
	})
})
