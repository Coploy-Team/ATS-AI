import { z } from 'zod'

// Módulos F2 devem emitir eventos somente via `createOutboxWriter`, que valida
// payloads contra este catálogo antes de persistir no outbox.
const basePayload = z.object({
	occurredAt: z.string().datetime().optional(),
})

export const eventCatalog = {
	vaga_publicada: basePayload
		.extend({
			jobId: z.string().min(1),
			title: z.string().min(1).optional(),
			publishedByUserId: z.string().min(1).optional(),
		})
		.passthrough(),
	candidatura_criada: basePayload
		.extend({
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			candidateId: z.string().min(1).optional(),
			pessoaId: z.string().min(1).optional(),
		})
		.passthrough(),
	candidatura_movida: basePayload
		.extend({
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			fromStatus: z.string().min(1),
			toStatus: z.string().min(1),
			movedByUserId: z.string().min(1).optional(),
		})
		.passthrough(),
	candidatura_reprovada: basePayload
		.extend({
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			rejectionReasonCode: z.string().min(1),
			rejectionReasonLabel: z.string().min(1).optional(),
			rejectedByUserId: z.string().min(1).optional(),
		})
		.passthrough(),
	feedback_enviado: basePayload
		.extend({
			applicationId: z.string().min(1),
			jobId: z.string().min(1).optional(),
			channel: z.enum(['email', 'whatsapp', 'in_app']),
			sentAt: z.string().datetime(),
			templateId: z.string().min(1).optional(),
		})
		.passthrough(),
	screening_knockout: basePayload
		.extend({
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			reasonCode: z.string().min(1),
			reasonLabel: z.string().min(1).optional(),
			/** Mesma explicação humana gravada em JobApplied.rejectionEvidence. */
			rejectionEvidence: z.string().min(1).nullable().optional(),
			passed: z.literal(false).optional(),
		})
		.passthrough(),
	rejection_review_requested: basePayload
		.extend({
			requestId: z.string().min(1),
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			candidateId: z.string().min(1),
		})
		.passthrough(),
	rejection_review_resolved: basePayload
		.extend({
			requestId: z.string().min(1),
			applicationId: z.string().min(1),
			jobId: z.string().min(1),
			status: z.enum(['upheld', 'overturned']),
			reviewedByUserId: z.string().min(1),
		})
		.passthrough(),
	vaga_sla_alerta: basePayload
		.extend({
			jobId: z.string().min(1),
			overdueCount: z.number().int().nonnegative(),
			activeCount: z.number().int().nonnegative(),
			ratio: z.number().min(0).max(1),
			alertedAt: z.string().datetime(),
		})
		.passthrough(),
	vaga_sla_auto_stopped: basePayload
		.extend({
			jobId: z.string().min(1),
			stoppedAt: z.string().datetime(),
			ratio: z.number().min(0).max(1),
		})
		.passthrough(),
	vaga_sla_regularizada: basePayload
		.extend({
			jobId: z.string().min(1),
			regularizedAt: z.string().datetime(),
			ratio: z.number().min(0).max(1),
		})
		.passthrough(),
} as const

export type DomainEventType = keyof typeof eventCatalog
export type DomainEventPayload<TType extends DomainEventType> = z.infer<
	(typeof eventCatalog)[TType]
>

export function isKnownEventType(type: string): type is DomainEventType {
	return type in eventCatalog
}
