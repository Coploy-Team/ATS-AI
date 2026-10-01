import { toOtsJob, toOtsJobDetails, toOtsProcessEntry, toOtsProfile } from '../ots-binding'
import type { PublicJobDetails, PublicJobSummary } from '../services/public-jobs-service'
import type { CandidateInterviewSummary } from '../core-client'

const summary: PublicJobSummary = {
	jobId: 'job-1',
	companyId: 'company-1',
	title: 'Pessoa Desenvolvedora Backend',
	jobName: 'Backend Pleno (interno)',
	companyName: 'Forkly Studio',
	companyLogo: null,
	location: 'Remoto',
	workModality: 'remote',
	employmentType: 'CLT',
	careerLevel: 'Pleno',
	language: 'pt-BR',
	salary: null,
	mainSkills: 'Node, React',
	postedAt: '2026-08-01T00:00:00.000Z',
	interviewUrl: 'https://interview.example/job/job-1/company/company-1/login',
}

const interview: CandidateInterviewSummary = {
	id: 'ja-1',
	jobId: 'job-1',
	companyId: 'company-1',
	jobName: 'Backend',
	companyName: 'Forkly Studio',
	companyLogo: null,
	startedAt: '2026-08-01T10:00:00.000Z',
	completedAt: null,
	finished: false,
	status: 'in_progress',
	questionsAnswered: 2,
	questionsTotal: 5,
	interviewUrl: 'https://interview.example/x',
	feedback: { strengths: [], development: [], suggestions: [] },
	rejectionExplanation: null,
	failedRequirementLabel: null,
}

describe('ots-binding mappers', () => {
	it('job carries title, never the deprecated internal jobName', () => {
		const job = toOtsJob(summary)
		expect(job.title).toBe('Pessoa Desenvolvedora Backend')
		expect('jobName' in job).toBe(false)
	})

	it('job details keeps the whitelist and questionCount only', () => {
		const details = toOtsJobDetails({
			...summary,
			description: 'desc',
			requirements: null,
			responsibilities: null,
			benefits: null,
			companyDescription: null,
			contractType: null,
			jobHours: null,
			educationalRequirements: null,
			requiresPreviousExperience: null,
			closingDate: null,
			interviewMode: null,
			questionCount: 5,
		} satisfies PublicJobDetails)
		expect(details.questionCount).toBe(5)
		expect('jobQuestions' in details).toBe(false)
		expect('jobName' in details).toBe(false)
	})

	it('process entry NEVER carries score or approved, even if upstream does', () => {
		const polluted = {
			...interview,
			score: 8.4,
			approved: true,
			recommendation: 'hire',
		} as CandidateInterviewSummary
		const entry = toOtsProcessEntry(polluted)
		expect('score' in entry).toBe(false)
		expect('approved' in entry).toBe(false)
		expect('recommendation' in entry).toBe(false)
		expect(entry.status).toBe('in_progress')
		expect(entry.interview).toEqual({
			questionsAnswered: 2,
			questionsTotal: 5,
			interviewUrl: 'https://interview.example/x',
		})
	})

	it('profile is an explicit allowlist: protected attributes have no way in', () => {
		const profile = toOtsProfile('uid-1', {
			id: 'uid-1',
			name: 'João',
			cpf: '00000000000',
			gender: 'x',
			birthDate: '1990-01-01',
		} as never)
		expect(profile.name).toBe('João')
		expect('cpf' in profile).toBe(false)
		expect('gender' in profile).toBe(false)
		expect('birthDate' in profile).toBe(false)
	})

	it('empty profile still satisfies the required id', () => {
		expect(toOtsProfile('uid-9', null).id).toBe('uid-9')
	})
})
