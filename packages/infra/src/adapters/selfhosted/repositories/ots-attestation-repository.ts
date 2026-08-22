import { and, desc, isNull } from 'drizzle-orm'

import type { OtsAttestation } from '@coploy/domain'
import type { OtsAttestationRepository } from '../../../interfaces/repositories/ots-attestation-repository'
import type { DrizzleDb } from '../db/client'
import { eq, schema } from './helpers'

type Row = typeof schema.otsAttestations.$inferSelect

function mapRow(row: Row): OtsAttestation {
	return {
		id: row.id,
		userId: row.userId,
		jobAppliedId: row.jobAppliedId,
		companyId: row.companyId,
		jobId: row.jobId,
		tier: row.tier as OtsAttestation['tier'],
		kid: row.kid,
		jws: row.jws,
		issuedAt: row.issuedAt,
		expiresAt: row.expiresAt,
		revokedAt: row.revokedAt,
	}
}

export function createDrizzleOtsAttestationRepository(db: DrizzleDb): OtsAttestationRepository {
	return {
		async createAttestation(record) {
			await db.insert(schema.otsAttestations).values({
				id: record.id,
				userId: record.userId,
				jobAppliedId: record.jobAppliedId,
				companyId: record.companyId,
				jobId: record.jobId,
				tier: record.tier,
				kid: record.kid,
				jws: record.jws,
				issuedAt: record.issuedAt,
				expiresAt: record.expiresAt,
				revokedAt: record.revokedAt,
			})
		},

		async getAttestation(jti) {
			const rows = await db
				.select()
				.from(schema.otsAttestations)
				.where(eq(schema.otsAttestations.id, jti))
				.limit(1)
			const row = rows.at(0)
			return row ? mapRow(row) : null
		},

		async listAttestationsByUser(userId) {
			const rows = await db
				.select()
				.from(schema.otsAttestations)
				.where(eq(schema.otsAttestations.userId, userId))
				.orderBy(desc(schema.otsAttestations.issuedAt))
			return rows.map(mapRow)
		},

		async revokeAttestation(jti, userId) {
			// UPDATE condicional: dono + ainda não revogado num comando só.
			const rows = await db
				.update(schema.otsAttestations)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(schema.otsAttestations.id, jti),
						eq(schema.otsAttestations.userId, userId),
						isNull(schema.otsAttestations.revokedAt),
					),
				)
				.returning()
			if (rows.length > 0) return true
			// Já revogado (idempotência) ainda é true — só "não existe/não é dele" é false.
			const existing = await db
				.select({ userId: schema.otsAttestations.userId })
				.from(schema.otsAttestations)
				.where(eq(schema.otsAttestations.id, jti))
				.limit(1)
			return existing.at(0)?.userId === userId
		},
	}
}
