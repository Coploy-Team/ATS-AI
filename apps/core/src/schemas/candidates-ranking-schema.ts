import { z } from 'zod'
import {
	CandidateStatus,
	DataRange,
	InterviewCount,
} from '@/http/constants/candidate-filters'
import { paginationSchema } from './common-schemas'

export const candidatesRankingQuerySchema = z.object({
	page: z.string().default('1').transform(Number),
	limit: z.string().default('10').transform(Number),
	find: z.string().optional(),
	cursor: z.string().optional(), // Cursor para paginação (timestamp ISO da última entrevista)
	status: z
		.enum([
			CandidateStatus.ALL,
			CandidateStatus.APPROVED,
			CandidateStatus.REJECTED,
			CandidateStatus.SELECTED,
			CandidateStatus.PENDING,
		])
		.default(CandidateStatus.ALL),
	dataRange: z
		.enum([
			DataRange.ALL,
			DataRange.LAST_WEEK,
			DataRange.LAST_MONTH,
			DataRange.LAST_3_MONTHS,
		])
		.default(DataRange.ALL),
	interviewCount: z
		.enum([
			InterviewCount.ALL,
			InterviewCount.AT_LEAST_ONE,
			InterviewCount.MORE_THAN_ONE,
		])
		.default(InterviewCount.ALL),
	score: z.string().transform(Number).optional(),
	jobId: z.string().optional(),
})

export const candidatesRankingResponseSchema = z.object({
	candidates: z.array(
		z
			.object({
				masked: z.boolean().optional(),
				name: z.string(),
				email: z.string(),
				photo_url: z.string(),
				interviews: z.number(),
				averageScore: z.number().nullable(),
				lastInterview: z.string().nullable(),
				status: z.string().nullable(),
				userId: z.string().nullable(),
				jobsApplied: z.array(z.record(z.string(), z.unknown())).optional(),
				// ✅ NOVOS CAMPOS DO USUÁRIO
				phone_number: z.string().nullable().optional(),
				occupation: z.string().nullable().optional(),
				level: z.string().nullable().optional(),
				city: z.string().nullable().optional(),
				state: z.string().nullable().optional(),
				academic: z.string().nullable().optional(),
				professional_experience: z.string().nullable().optional(),
				professionalObjectives: z.string().nullable().optional(),
				resumeUrl: z.string().nullable().optional(),
				language: z.string().nullable().optional(),
				countryOfResidence: z.string().nullable().optional(),
				countriesOfInterest: z.array(z.string()).optional(),
				created_time: z.string().nullable().optional(),
				external_id: z.string().nullable().optional(),
				finished: z.boolean().optional(),
				dreamJobsInterview: z.any().nullable().optional(),
				paymentDetails: z.any().nullable().optional(),
				pdf_socioEmotional: z.string().nullable().optional(),
				testing: z.boolean().optional(),
			})
			.passthrough(),
	),
	pagination: paginationSchema,
	nextCursor: z.string().nullable(), // Cursor para próxima página (timestamp ISO)
})
