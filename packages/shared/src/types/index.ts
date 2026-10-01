/**
 * Fastify request augmentation.
 *
 * These methods are injected by the auth middleware (createAuthMiddleware).
 * Apps that use the middleware should add this to their own type declarations:
 *
 * @example
 * ```typescript
 * // apps/recruiter/src/types/fastify.d.ts
 * import '@coploy/shared/types'
 * ```
 */

export type AuthenticatedRequest = {
	getCurrentUser: () => Promise<string>
	getUserMembership: () => Promise<{ company: Record<string, unknown> }>
	getAccessToken: () => Promise<string>
}
