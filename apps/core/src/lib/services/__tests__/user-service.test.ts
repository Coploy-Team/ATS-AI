import { createUserService } from '../user-service'
import { createMockInfra } from './mock-infra'

// env vars are set in jest.setup.ts (setupFiles)

describe('createUserService — resolveInterviewScoreAccess', () => {
	const INTERVIEW_DATE = new Date('2024-04-03T11:00:00.000Z')

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createUserService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createUserService(infra)
	})

	// 1. Enterprise → score always visible
	it('enterprise: returns true', () => {
		const result = service.resolveInterviewScoreAccess({
			company: { subscriptionTrial: null },
			interviewDate: INTERVIEW_DATE,
			isEnterprise: true,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(true)
	})

	// 2. Grace period → score always visible
	it('enterprise grace period: returns true', () => {
		const result = service.resolveInterviewScoreAccess({
			company: { subscriptionTrial: null },
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: true,
			hasCredit: false,
		})

		expect(result).toBe(true)
	})

	// 3. Non-enterprise + hasCredit → score visible
	it('non-enterprise + hasCredit: returns true', () => {
		const result = service.resolveInterviewScoreAccess({
			company: { subscriptionTrial: null },
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: true,
		})

		expect(result).toBe(true)
	})

	// 4. Non-enterprise + no credit + interview within courtesy window → score visible
	it('non-enterprise, no credit, interview date < subscriptionTrial.startAt (cortesia): returns true', () => {
		const result = service.resolveInterviewScoreAccess({
			company: {
				subscriptionTrial: { startAt: new Date('2025-01-01T00:00:00.000Z') },
			},
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(true)
	})

	// 5. Non-enterprise + no credit + interview at/after startAt → score hidden
	it('non-enterprise, no credit, interview date >= subscriptionTrial.startAt: returns false', () => {
		const result = service.resolveInterviewScoreAccess({
			company: {
				subscriptionTrial: { startAt: new Date('2024-01-01T00:00:00.000Z') },
			},
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(false)
	})

	// 6. Non-enterprise + no credit + company sem subscriptionTrial.startAt → score hidden
	it('non-enterprise, no credit, company without subscriptionTrial.startAt: returns false', () => {
		const result = service.resolveInterviewScoreAccess({
			company: { subscriptionTrial: null },
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(false)
	})

	// 7. Non-enterprise + no credit + company null entirely → score hidden
	it('non-enterprise, no credit, company doc null: returns false', () => {
		const result = service.resolveInterviewScoreAccess({
			company: null,
			interviewDate: INTERVIEW_DATE,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(false)
	})

	// 8. Invalid interview date with valid startAt → score hidden (safe default)
	it('non-enterprise, no credit, invalid interview date: returns false', () => {
		const result = service.resolveInterviewScoreAccess({
			company: {
				subscriptionTrial: { startAt: new Date('2025-01-01T00:00:00.000Z') },
			},
			interviewDate: null,
			isEnterprise: false,
			withinEnterpriseGrace: false,
			hasCredit: false,
		})

		expect(result).toBe(false)
	})
})
