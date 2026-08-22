import { candidateMeDreamJobsInterviewSchema } from '../candidate-me'

/**
 * Garante que /auth/me aceita o shape que profile-interview-service grava hoje
 * ({ jobId, createdAt, status } sem jobAppliedId). Com o schema antigo
 * (jobAppliedId obrigatório) este parse falhava e derrubava a rota.
 */
describe('candidateMeDreamJobsInterviewSchema', () => {
	it('accepts dreamJobsInterview without jobAppliedId (current writer shape)', () => {
		const result = candidateMeDreamJobsInterviewSchema.safeParse({
			jobId: 'mirror-job-1',
			createdAt: new Date('2026-08-14T00:00:00Z'),
			status: 'pending',
		})

		expect(result.success).toBe(true)
	})

	it('accepts null when user has no profile interview', () => {
		expect(candidateMeDreamJobsInterviewSchema.safeParse(null).success).toBe(true)
	})

	it('accepts legacy docs that still have jobAppliedId', () => {
		const result = candidateMeDreamJobsInterviewSchema.safeParse({
			jobId: 'job-1',
			jobAppliedId: 'ja-1',
			status: 'completed',
			generalFeedback: null,
		})

		expect(result.success).toBe(true)
	})
})
