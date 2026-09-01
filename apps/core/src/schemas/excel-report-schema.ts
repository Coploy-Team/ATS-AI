import { z } from 'zod'
import {
	CandidateStatus,
	DataRange,
	InterviewCount,
} from '@/http/constants/candidate-filters'

const excelReportFiltersSchema = z.object({
	find: z.string().optional(),
	status: z
		.enum([
			CandidateStatus.ALL,
			CandidateStatus.APPROVED,
			CandidateStatus.REJECTED,
			CandidateStatus.SELECTED,
			CandidateStatus.PENDING,
		])
		.optional(),
	dataRange: z
		.enum([
			DataRange.ALL,
			DataRange.LAST_WEEK,
			DataRange.LAST_MONTH,
			DataRange.LAST_3_MONTHS,
		])
		.optional(),
	interviewCount: z
		.enum([
			InterviewCount.ALL,
			InterviewCount.AT_LEAST_ONE,
			InterviewCount.MORE_THAN_ONE,
		])
		.optional(),
	score: z.number().optional(),
	jobId: z.string().optional(),
})

export const generateExcelReportBodySchema = z.object({
	refId: z.string(),
	filters: excelReportFiltersSchema.optional(),
})

const currentYear = new Date().getFullYear()
export const generateExcelReportByYearBodySchema = z.object({
	year: z
		.number()
		.int()
		.min(2015)
		.max(currentYear + 1),
	filters: excelReportFiltersSchema.optional(),
})

export const generateExcelReportResponseSchema = z.object({
	processo_iniciado: z.boolean(),
	uid_temporario: z.string(),
})

export const generateExcelReportErrorSchema = z.object({
	processo_iniciado: z.boolean(),
	message: z.string(),
})

export const getExcelReportParamsSchema = z.object({
	uidTemporario: z.string(),
})

export const excelReportProgressSchema = z.object({
	current: z.number(),
	total: z.number(),
	status: z.string(),
})

export const getExcelReportSuccessSchema = z.object({
	base64Excel: z.string().nullable(),
	message: z.string(),
	status: z.enum(['completed', 'processing', 'not_found', 'failed']),
	progress: excelReportProgressSchema.optional(),
})

export const getExcelReportErrorSchema = z.object({
	base64Excel: z.null(),
	message: z.string(),
	status: z.enum(['completed', 'processing', 'not_found', 'failed']),
})
