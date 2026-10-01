import type { FastifyInstance } from 'fastify'
import { fastifyPlugin } from 'fastify-plugin'

import { UnauthorizedError } from '../errors/unauthorized'

declare module 'fastify' {
	interface FastifyRequest {
		getCurrentUser: () => Promise<string>
		getUserMembership: () => Promise<{ company: { id: string; [key: string]: unknown } }>
		getAccessToken: () => Promise<string>
	}
}

/**
 * Dependencies required by the auth middleware.
 *
 * Each app provides its own implementations, keeping the
 * middleware decoupled from Firebase or any specific provider.
 */
export type AuthDependencies = {
	verifyIdToken: (token: string) => Promise<{ uid: string }>
	getUser: (userId: string) => Promise<{ id: string; company: string | { id: string } } | null>
	getCompany: (companyId: string) => Promise<{ id: string; [key: string]: unknown } | null>
}

function extractBearerToken(authHeader: string | undefined): string {
	if (!authHeader?.startsWith('Bearer ')) {
		throw new UnauthorizedError('Missing or invalid authorization header')
	}
	return authHeader.split('Bearer ')[1]
}

/** Extrai companyId do user (Firestore: .id, MongoDB: ._id ou string). */
function getCompanyId(user: { company?: string | { id?: string; _id?: unknown } }): string | undefined {
	if (!user?.company) return undefined
	const c = user.company
	if (typeof c === 'string') return c
	if (c.id) return c.id
	const raw = (c as { _id?: unknown })._id
	if (raw != null) return typeof raw === 'string' ? raw : String(raw)
	return undefined
}

/**
 * Creates a Fastify auth middleware plugin.
 *
 * Augments `request` with `getCurrentUser()`, `getUserMembership()`,
 * and `getAccessToken()` methods.
 *
 * @example
 * ```typescript
 * const authMiddleware = createAuthMiddleware({
 *   verifyIdToken: (token) => firebase.auth.verifyIdToken(token),
 *   getUser: (id) => firestoreDB.get('usersCompany', id),
 *   getCompany: (id) => firestoreDB.get('companies', id),
 * })
 *
 * app.register(authMiddleware)
 * ```
 */
export function createAuthMiddleware(deps: AuthDependencies) {
	return fastifyPlugin(async (app: FastifyInstance) => {
		app.addHook('preHandler', async (request) => {
			request.getCurrentUser = async () => {
				const token = extractBearerToken(request.headers.authorization)
				try {
					const decoded = await deps.verifyIdToken(token)
					return decoded.uid
				} catch {
					throw new UnauthorizedError('Invalid auth token')
				}
			}

			request.getUserMembership = async () => {
				const userId = await request.getCurrentUser()

				const user = await deps.getUser(userId)
				if (!user) {
					throw new UnauthorizedError('User not found')
				}

				const companyId = getCompanyId(user)
				if (!companyId) {
					throw new UnauthorizedError('Company not found')
				}

				const company = await deps.getCompany(companyId)
				if (!company) {
					throw new UnauthorizedError('Company not found')
				}

				return { company }
			}

			request.getAccessToken = async () => {
				return extractBearerToken(request.headers.authorization)
			}
		})
	})
}
