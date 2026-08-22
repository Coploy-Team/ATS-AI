import { recordDashboardAudit } from '@/http/plugins/dashboard-audit'
import { createMockInfra } from './mock-infra'

describe('recordDashboardAudit', () => {
	it('chama auditLogRepository.create com os campos corretos e não bloqueia', async () => {
		const infra = createMockInfra()
		infra.auditLogRepository.create.mockResolvedValue({
			id: 'audit-1',
			at: new Date(),
			actor: 'user-abc',
			actorRole: null,
			action: 'job.created',
			target: 'job:company-xyz',
			targetType: 'job',
			targetId: 'job-123',
			scope: 'company-xyz',
			metadata: { jobName: 'Dev Backend' },
		})

		recordDashboardAudit(infra, {
			action: 'job.created',
			userId: 'user-abc',
			companyId: 'company-xyz',
			resource: 'job',
			resourceId: 'job-123',
			metadata: { jobName: 'Dev Backend' },
		})

		// Fire-and-forget: aguarda microtask queue para confirmar chamada
		await Promise.resolve()

		expect(infra.auditLogRepository.create).toHaveBeenCalledTimes(1)
		expect(infra.auditLogRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				actor: 'user-abc',
				action: 'job.created',
				target: 'job:company-xyz',
				targetType: 'job',
				targetId: 'job-123',
				scope: 'company-xyz',
				metadata: { jobName: 'Dev Backend' },
			}),
		)
	})
})
