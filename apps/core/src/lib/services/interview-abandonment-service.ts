import {
	INTERVIEW_ABANDONMENT_REASONS,
	type InterviewAbandonment,
} from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'
import { z } from 'zod'

const commentSchema = z
	.string()
	.transform((value) => value.trim())
	.refine((value) => value.length <= 1000, {
		message: 'Comment must be at most 1000 characters',
	})

const createInterviewAbandonmentSchema = z.object({
	interviewId: z.string().min(1),
	jobId: z.string().min(1),
	companyId: z.string().min(1),
	userId: z.string().min(1).optional(),
	reason: z.enum(INTERVIEW_ABANDONMENT_REASONS),
	comment: commentSchema.optional(),
	questionIndex: z.number().int().min(0).optional(),
})

export type CreateInterviewAbandonmentInput = z.input<
	typeof createInterviewAbandonmentSchema
>

export function createInterviewAbandonmentService(infra: InfraProvider) {
	return {
		async create(
			input: CreateInterviewAbandonmentInput,
		): Promise<InterviewAbandonment & { id: string }> {
			const parsed = createInterviewAbandonmentSchema.safeParse(input)
			if (!parsed.success) {
				throw new BadRequestError('Dados de abandono de entrevista inválidos')
			}

			return infra.interviewAbandonmentRepository.create({
				interviewId: parsed.data.interviewId,
				jobId: parsed.data.jobId,
				companyId: parsed.data.companyId,
				userId: parsed.data.userId ?? null,
				reason: parsed.data.reason,
				comment: parsed.data.comment || null,
				questionIndex: parsed.data.questionIndex ?? null,
				createdAt: new Date().toISOString(),
			})
		},
	}
}
