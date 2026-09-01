import { and, gt, isNull } from 'drizzle-orm'

import type { InterviewHandoff } from '@coploy/domain'
import type { InterviewHandoffRepository } from '../../../interfaces/repositories/interview-handoff-repository'
import type { DrizzleDb } from '../db/client'
import { eq, schema } from './helpers'

export function createDrizzleInterviewHandoffRepository(db: DrizzleDb): InterviewHandoffRepository {
	return {
		async createHandoff(code, userId, expiresAt) {
			await db.insert(schema.interviewHandoffs).values({ id: code, userId, expiresAt })
		},

		async consumeHandoff(code) {
			const usedAt = new Date()
			// UPDATE condicional: o próprio banco garante o uso único — só a
			// primeira transação encontra `usedAt IS NULL` e retorna linha.
			const rows = await db
				.update(schema.interviewHandoffs)
				.set({ usedAt })
				.where(
					and(
						eq(schema.interviewHandoffs.id, code),
						isNull(schema.interviewHandoffs.usedAt),
						gt(schema.interviewHandoffs.expiresAt, new Date()),
					),
				)
				.returning()

			const row = rows.at(0)
			if (!row) return null

			return {
				id: row.id,
				userId: row.userId,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				usedAt: row.usedAt ?? usedAt,
			} satisfies InterviewHandoff
		},
	}
}
