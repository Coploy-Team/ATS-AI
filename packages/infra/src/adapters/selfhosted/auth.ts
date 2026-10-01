import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, jwt } from 'better-auth/plugins'
import { and, eq, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'

import type {
	AuthAdapter,
	CreateUserAndGetTokenResult,
	CreateUserParams,
	DecodedToken,
	UserRecord,
} from '../../interfaces/auth'
import { authAccounts, authJwks, authSessions, authUsers, authVerifications } from './db/schema/auth'

export type BetterAuthConfig = {
	postgresUrl: string
	postgresSsl?: boolean
	baseUrl: string
	secret: string
	jwtExpirationTime?: string
	trustedOrigins?: string[]
}

function normalizeDomain(value: string): string {
	return value
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.toLowerCase()
}

function shouldUseSecureCookies(baseUrl: string): boolean {
	try {
		return new URL(baseUrl).protocol === 'https:'
	} catch {
		// Fallback for malformed/partial URLs
		return !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')
	}
}

function addOrigin(candidate: string, set: Set<string>) {
	try {
		const parsed = new URL(candidate)
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			set.add(parsed.origin)
		}
	} catch {
		// Ignore invalid URLs from env/config
	}
}

function getSelfHostedTrustedOrigins(config: BetterAuthConfig): string[] {
	const origins = new Set<string>([
		'http://localhost:5173',
		'http://localhost:5174',
		'http://localhost:3333',
	])

	addOrigin(config.baseUrl, origins)

	const domainEnv = process.env.DOMAIN ? normalizeDomain(process.env.DOMAIN) : null
	if (domainEnv) {
		addOrigin(`https://${domainEnv}`, origins)
		addOrigin(`http://${domainEnv}`, origins)
		for (const subdomain of ['api', 'dashboard', 'app', 'orchestrator', 'engine']) {
			addOrigin(`https://${subdomain}.${domainEnv}`, origins)
			addOrigin(`http://${subdomain}.${domainEnv}`, origins)
		}
	}

	try {
		const baseHost = new URL(config.baseUrl).hostname
		const apiHostMatch = baseHost.match(/^api\.(.+)$/i)
		if (apiHostMatch?.[1]) {
			const rootDomain = apiHostMatch[1]
			addOrigin(`https://${rootDomain}`, origins)
			addOrigin(`http://${rootDomain}`, origins)
			for (const subdomain of ['api', 'dashboard', 'app', 'orchestrator', 'engine']) {
				addOrigin(`https://${subdomain}.${rootDomain}`, origins)
				addOrigin(`http://${subdomain}.${rootDomain}`, origins)
			}
		}
	} catch {
		// Ignore invalid base URL and keep defaults
	}

	for (const configuredOrigin of config.trustedOrigins ?? []) {
		addOrigin(configuredOrigin, origins)
	}

	return [...origins]
}

const authSchema = {
	user: authUsers,
	session: authSessions,
	account: authAccounts,
	verification: authVerifications,
	jwks: authJwks,
}

export function createBetterAuthAdapter(
	config: BetterAuthConfig,
): AuthAdapter & { authInstance: ReturnType<typeof betterAuth> } {
	const pool = new Pool({
		connectionString: config.postgresUrl,
		ssl: config.postgresSsl ? { rejectUnauthorized: false } : undefined,
	})
	const db = drizzle(pool, { schema: authSchema })

	const origins = getSelfHostedTrustedOrigins(config)
	const useSecureCookies = shouldUseSecureCookies(config.baseUrl)

	const auth = betterAuth({
		baseURL: config.baseUrl,
		secret: config.secret,
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: authSchema,
			camelCase: true,
		}),
		trustedOrigins: origins,
		plugins: [
			/*
			 * bearer: aceita `Authorization: Bearer <session token>` além do
			 * cookie. Sem ele, o handoff da sala de entrevista (decisão 1 do
			 * ADR-009) morria em silêncio: o client validava o token trocado
			 * via get-session, o servidor ignorava o header e respondia null —
			 * e o candidato voltava pro portal em loop.
			 */
			bearer(),
			jwt({
				jwt: {
					issuer: config.baseUrl,
					audience: config.baseUrl,
					expirationTime: config.jwtExpirationTime ?? '1h',
				},
			}),
		],
		user: {
			deleteUser: { enabled: true },
		},
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			useSecureCookies,
			crossSubDomainCookies: {
				enabled: false,
			},
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 60 * 5,
			},
		},
	})

	const jwksUrl = new URL('/api/auth/jwks', config.baseUrl)
	const remoteJWKS = createRemoteJWKSet(jwksUrl)

	function parseExpirationMs(value: string | undefined, fallbackMs: number): number {
		if (!value) return fallbackMs
		const match = value.trim().match(/^(\d+)\s*([smhd])?$/i)
		if (!match) return fallbackMs
		const amount = Number(match[1])
		const unit = (match[2] ?? 's').toLowerCase()
		const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
		return amount * (multipliers[unit] ?? 1000)
	}

	const adapter: AuthAdapter = {
		async verifyToken(token: string): Promise<DecodedToken> {
			try {
				const { payload } = await jwtVerify(token, remoteJWKS, {
					issuer: config.baseUrl,
					audience: config.baseUrl,
				})

				return {
					uid: (payload.sub ?? payload.id) as string,
					email: payload.email as string | undefined,
				}
			} catch {
				// JWT verification failed — try as BetterAuth session token
			}

			try {
				const session = await db
					.select({ userId: authSessions.userId, email: authUsers.email })
					.from(authSessions)
					.leftJoin(authUsers, eq(authSessions.userId, authUsers.id))
					.where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
					.limit(1)

				if (session.length) {
					return {
						uid: String(session[0].userId),
						email: session[0].email ?? undefined,
					}
				}
			} catch (err) {
				console.warn('[BetterAuth] Direct session lookup failed:', (err as Error).message)
			}

			try {
				const session = await auth.api.getSession({
					headers: new Headers({ authorization: `Bearer ${token}` }),
				})

				if (session?.user) {
					return {
						uid: session.user.id,
						email: session.user.email,
					}
				}
			} catch (err) {
				console.warn('[BetterAuth] auth.api.getSession failed:', (err as Error).message)
			}

			throw new Error('Invalid or expired token')
		},

		async createUser(params: CreateUserParams): Promise<UserRecord> {
			try {
				const response = await auth.api.signUpEmail({
					body: {
						email: params.email,
						password: params.password ?? '',
						name: params.displayName ?? params.email,
					},
				})

				if (!response?.user) {
					throw new Error('BetterAuth signUpEmail returned no user')
				}

				return {
					uid: response.user.id,
					email: response.user.email,
					displayName: response.user.name,
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)

				if (
					message.includes('already') ||
					message.includes('exist') ||
					message.includes('duplicate')
				) {
					throw new Error('email-already-in-use')
				}

				console.error('[BetterAuth] createUser failed:', message)
				throw error
			}
		},

		async getUserByEmail(email: string): Promise<UserRecord | null> {
			try {
				const user = await db
					.select()
					.from(authUsers)
					.where(eq(authUsers.email, email))
					.limit(1)

				if (!user.length) return null

				return {
					uid: user[0].id,
					email: user[0].email,
					displayName: user[0].name ?? undefined,
				}
			} catch {
				return null
			}
		},

		async getUserByPhone(phone: string): Promise<UserRecord | null> {
			try {
				const user = await db
					.select()
					.from(authUsers)
					.where(eq(authUsers.phoneNumber, phone))
					.limit(1)

				if (!user.length) return null

				return {
					uid: user[0].id,
					email: user[0].email,
					displayName: user[0].name ?? undefined,
					phoneNumber: user[0].phoneNumber ?? undefined,
				}
			} catch {
				return null
			}
		},

		async deleteUser(uid: string): Promise<void> {
			await db.delete(authUsers).where(eq(authUsers.id, uid))
		},

		async createCustomToken(uid: string, _claims?: Record<string, unknown>): Promise<string> {
			const userExists = await db
				.select({ id: authUsers.id })
				.from(authUsers)
				.where(eq(authUsers.id, uid))
				.limit(1)

			if (!userExists.length) {
				throw new Error(`Cannot create session: user ${uid} not found`)
			}

			const expiresInMs = parseExpirationMs(config.jwtExpirationTime, 60 * 60 * 1000)
			const token = randomBytes(32).toString('hex')

			await db.insert(authSessions).values({
				id: randomUUID(),
				token,
				userId: uid,
				expiresAt: new Date(Date.now() + expiresInMs),
			})

			return token
		},

		async signInWithPassword(email: string, password: string): Promise<string> {
			const signInRes = await auth.api.signInEmail({
				body: { email, password },
			})

			const session = (signInRes as { session?: { token?: string } })?.session
			const token = session?.token ?? (signInRes as { token?: string }).token
			if (!token) {
				throw new Error('Credenciais inválidas')
			}
			return token
		},

		async createUserAndGetToken(params: CreateUserParams): Promise<CreateUserAndGetTokenResult> {
			const signUpRes = await auth.api.signUpEmail({
				body: {
					email: params.email,
					password: params.password ?? '',
					name: params.displayName ?? params.email,
				},
			})

			if (!signUpRes?.user) {
				const message = (signUpRes as { error?: { message?: string } })?.error?.message
				if (
					typeof message === 'string' &&
					(message.includes('already') || message.includes('exist') || message.includes('duplicate'))
				) {
					throw new Error('email-already-in-use')
				}
				throw new Error(message ?? 'BetterAuth signUpEmail failed')
			}

			const signInRes = await auth.api.signInEmail({
				body: { email: params.email, password: params.password ?? '' },
			})

			const session = (signInRes as { session?: { token?: string } })?.session
			const token = session?.token ?? (signInRes as { token?: string }).token
			if (!token) {
				throw new Error('Failed to generate authentication token')
			}

			return {
				uid: String(signUpRes.user.id),
				token,
				refreshToken: token,
			}
		},
	}

	return { ...adapter, authInstance: auth }
}
