import type { InfraProvider } from '@coploy/infra'
import { createAuthMiddleware } from '@coploy/shared/middleware'

import { firebaseAdminAuth } from '@/lib/init'

export function createAuth(infra: InfraProvider) {
	return createAuthMiddleware({
		verifyIdToken: (token) => firebaseAdminAuth.verifyIdToken(token),
		getUser: (userId) =>
			infra.userRepository.getUsersCompany(userId) as Promise<{ id: string; company: string | { id: string } } | null>,
		getCompany: (companyId) =>
			infra.companyRepository.getCompany(companyId) as Promise<{ id: string; [key: string]: unknown } | null>,
	})
}
