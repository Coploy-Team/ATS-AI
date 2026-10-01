import { z } from 'zod'

import {
	PROCESS_FEEDBACK_REASONS,
	PROCESS_FEEDBACK_STAGES,
	SCHEDULE_DECLINE_REASONS,
	SCHEDULE_FORMATS,
	SCHEDULE_STATUSES,
} from '@coploy/domain'

/** Wire do OTS 0.3 na API da Coploy — os mesmos vocabulários do protocolo. */

export const slotSchema = z.object({ start: z.string(), end: z.string() })

export const joinDetailsSchema = z.object({
	meetingUrl: z.string().nullable(),
	address: z.string().nullable(),
	instructions: z.string().nullable(),
})

export const scheduleSchema = z.object({
	id: z.string(),
	jobId: z.string(),
	jobAppliedId: z.string(),
	candidateId: z.string(),
	format: z.enum(SCHEDULE_FORMATS),
	durationMinutes: z.number(),
	timezone: z.string(),
	slots: z.array(slotSchema),
	status: z.enum(SCHEDULE_STATUSES),
	confirmedSlot: slotSchema.nullable(),
	expiresAt: z.string().nullable(),
	note: z.string().nullable(),
	joinDetails: joinDetailsSchema.nullable(),
	declineReason: z.enum(SCHEDULE_DECLINE_REASONS).nullable(),
	declineNote: z.string().nullable(),
	respondedAt: z.string().nullable(),
	respondedVia: z.enum(['candidate_area', 'agent']).nullable(),
	proposedByName: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

/** O que o talento vê: sem quem propôs dentro da empresa, com vaga e empresa. */
export const mySchedule = scheduleSchema
	.omit({ candidateId: true, proposedByName: true })
	.extend({ companyId: z.string(), jobName: z.string().nullable(), companyName: z.string().nullable() })

export const feedbackSchema = z.object({
	id: z.string(),
	jobId: z.string(),
	jobAppliedId: z.string(),
	candidateId: z.string(),
	stage: z.enum(PROCESS_FEEDBACK_STAGES),
	message: z.string(),
	reasonCode: z.enum(PROCESS_FEEDBACK_REASONS).nullable(),
	nextStep: z.string().nullable(),
	source: z.enum(['recruiter', 'rejection']),
	sentByName: z.string().nullable(),
	sentAt: z.string(),
})

export const myFeedback = feedbackSchema
	.omit({ candidateId: true, sentByName: true, source: true })
	.extend({ companyId: z.string(), jobName: z.string().nullable(), companyName: z.string().nullable() })

export const scheduleResponseSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('confirm'), slotStart: z.string().min(1) }),
	z.object({
		action: z.literal('decline'),
		reason: z.enum(SCHEDULE_DECLINE_REASONS),
		note: z.string().max(1000).nullable().optional(),
	}),
])
