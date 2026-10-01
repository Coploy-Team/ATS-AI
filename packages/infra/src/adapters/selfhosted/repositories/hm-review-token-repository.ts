import { and, gt, isNull } from 'drizzle-orm'

import type { HiringManagerReviewToken } from '@coploy/domain'
import type { HiringManagerReviewTokenRepository } from '../../../interfaces/repositories/hm-review-token-repository'
import type { DrizzleDb } from '../db/client'
import { eq, schema } from './helpers'

export function createDrizzleHiringManagerReviewTokenRepository(
	db: DrizzleDb,
): HiringManagerReviewTokenRepository {
	return {
		async createReviewToken(code, input) {
			await db.insert(schema.hmReviewTokens).values({
				id: code,
				companyId: input.companyId,
				jobId: input.jobId,
				jobAppliedIds: input.jobAppliedIds,
				createdByUserId: input.createdByUserId ?? null,
				expiresAt: input.expiresAt,
			})
		},

		async consumeReviewToken(code, accessCode, accessExpiresAt) {
			const usedAt = new Date()
			const rows = await db
				.update(schema.hmReviewTokens)
				.set({ usedAt, accessCode, accessExpiresAt })
				.where(
					and(
						eq(schema.hmReviewTokens.id, code),
						isNull(schema.hmReviewTokens.usedAt),
						gt(schema.hmReviewTokens.expiresAt, new Date()),
					),
				)
				.returning()

			const row = rows.at(0)
			if (!row) return null

			return {
				id: row.id,
				companyId: row.companyId,
				jobId: row.jobId,
				jobAppliedIds: Array.isArray(row.jobAppliedIds) ? row.jobAppliedIds.map(String) : [],
				createdByUserId: row.createdByUserId,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				usedAt: row.usedAt ?? usedAt,
				accessCode: row.accessCode ?? accessCode,
				accessExpiresAt: row.accessExpiresAt ?? accessExpiresAt,
			} satisfies HiringManagerReviewToken
		},

		async getByAccessCode(accessCode) {
			const rows = await db
				.select()
				.from(schema.hmReviewTokens)
				.where(
					and(
						eq(schema.hmReviewTokens.accessCode, accessCode),
						gt(schema.hmReviewTokens.accessExpiresAt, new Date()),
					),
				)
				.limit(1)

			const row = rows.at(0)
			if (!row) return null

			return {
				id: row.id,
				companyId: row.companyId,
				jobId: row.jobId,
				jobAppliedIds: Array.isArray(row.jobAppliedIds) ? row.jobAppliedIds.map(String) : [],
				createdByUserId: row.createdByUserId,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				usedAt: row.usedAt,
				accessCode: row.accessCode,
				accessExpiresAt: row.accessExpiresAt,
			} satisfies HiringManagerReviewToken
		},
	}
}
