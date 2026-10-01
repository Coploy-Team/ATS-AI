import { createAuthClient } from 'better-auth/client'
import type { AuthClient, AuthFeatures, AuthStateListener, AuthUser } from '../types'

type BetterAuthConfig = {
	baseURL: string
}

type SessionData = {
	user: { id: string; email: string; name?: string; image?: string | null }
	token?: string
}

const STORAGE_KEY_TOKEN = 'ba_session_token'
const STORAGE_KEY_USER = 'ba_user'

function persistSession(token: string | null, user: AuthUser | null) {
	try {
		if (token) {
			localStorage.setItem(STORAGE_KEY_TOKEN, token)
		} else {
			localStorage.removeItem(STORAGE_KEY_TOKEN)
		}
		if (user) {
			localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user))
		} else {
			localStorage.removeItem(STORAGE_KEY_USER)
		}
	} catch {
		// localStorage unavailable (SSR, private browsing)
	}
}

function loadPersistedToken(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY_TOKEN)
	} catch {
		return null
	}
}

function loadPersistedUser(): AuthUser | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_USER)
		return raw ? JSON.parse(raw) as AuthUser : null
	} catch {
		return null
	}
}

export function createBetterAuthClient(config: BetterAuthConfig): AuthClient {
	const client = createAuthClient({
		baseURL: config.baseURL,
		fetchOptions: {
			credentials: 'include',
		},
	})

	let currentUser: AuthUser | null = null
	let currentToken: string | null = null
	const listeners: Set<AuthStateListener> = new Set()

	const features: AuthFeatures = {
		phoneAuth: false,
		recaptcha: false,
		customToken: true,
		passwordReset: true,
		emailSignup: true,
	}

	function notifyListeners(user: AuthUser | null) {
		for (const listener of listeners) {
			listener(user)
		}
	}

	function toAuthUser(data: SessionData): AuthUser {
		return {
			uid: data.user.id,
			email: data.user.email,
			displayName: data.user.name ?? null,
			phoneNumber: null,
			photoURL: data.user.image ?? null,
		}
	}

	function extractToken(data: unknown): string | null {
		if (!data || typeof data !== 'object') return null

		if ('token' in data && typeof (data as Record<string, unknown>).token === 'string') {
			return (data as { token: string }).token
		}

		if ('session' in data) {
			const session = (data as { session: unknown }).session
			if (session && typeof session === 'object' && 'token' in session) {
				return (session as { token: string }).token ?? null
			}
		}

		return null
	}

	async function getTokenFromSession(): Promise<string | null> {
		try {
			const session = await client.getSession()
			return session.data ? extractToken(session.data) : null
		} catch {
			return null
		}
	}

	async function validateStoredSession(token: string): Promise<boolean> {
		try {
			const res = await fetch(`${config.baseURL}/api/auth/get-session`, {
				credentials: 'include',
				headers: { authorization: `Bearer ${token}` },
			})
			if (!res.ok) return false
			const data = await res.json() as { user?: SessionData['user'] }
			if (data?.user) {
				currentUser = {
					uid: data.user.id,
					email: data.user.email,
					displayName: data.user.name ?? null,
					phoneNumber: null,
					photoURL: data.user.image ?? null,
				}
				currentToken = token
				return true
			}
			return false
		} catch {
			return false
		}
	}

	const initialize = async (): Promise<void> => {
		/*
		 * TOKEN GUARDADO PRIMEIRO, cookie como fallback — a ordem inversa
		 * misturava personas no host único da open: cookie não distingue
		 * porta, então o login do CANDIDATO (sala :8082/portal :8081) gravava
		 * o cookie de sessão do core e o ATS (:8080), ao inicializar pelo
		 * cookie, adotava a sessão do candidato e "perdia" o recrutador
		 * (achado no teste do plugin, 2026-08-24). O token persistido é por
		 * ORIGEM (localStorage), então cada app mantém a própria persona; a
		 * validação usa o plugin bearer do servidor.
		 */
		const storedToken = loadPersistedToken()
		if (storedToken) {
			const valid = await validateStoredSession(storedToken)
			if (valid) {
				persistSession(currentToken, currentUser)
				notifyListeners(currentUser)
				return
			}
			persistSession(null, null)
		}

		try {
			const session = await client.getSession()
			if (session.data) {
				currentUser = toAuthUser(session.data as SessionData)
				currentToken = extractToken(session.data) ?? await getTokenFromSession()
				persistSession(currentToken, currentUser)
				notifyListeners(currentUser)
				return
			}
		} catch {
			// Cookie-based session failed (cross-origin or no session)
		}

		currentUser = null
		currentToken = null
	}

	const login = async (email: string, password: string) => {
		const result = await client.signIn.email({ email, password })

		if (result.error) {
			throw new Error(result.error.message ?? 'Login failed')
		}

		if (!result.data) {
			throw new Error('Login failed: no data returned')
		}

		const data = result.data as unknown as SessionData
		currentUser = toAuthUser(data)
		currentToken = extractToken(result.data) ?? await getTokenFromSession()
		persistSession(currentToken, currentUser)
		notifyListeners(currentUser)

		return { user: currentUser, token: currentToken ?? '' }
	}

	const signup = async (email: string, password: string, name?: string) => {
		const result = await client.signUp.email({
			email,
			password,
			name: name ?? email.split('@').at(0) ?? 'User',
		})

		if (result.error) {
			throw new Error(result.error.message ?? 'Signup failed')
		}

		if (!result.data) {
			throw new Error('Signup failed: no data returned')
		}

		const data = result.data as unknown as SessionData
		currentUser = toAuthUser(data)
		currentToken = extractToken(result.data) ?? await getTokenFromSession()
		persistSession(currentToken, currentUser)
		notifyListeners(currentUser)

		return { user: currentUser, token: currentToken ?? '' }
	}

	const logout = async () => {
		try { await client.signOut() } catch { /* ignore signout errors */ }
		currentUser = null
		currentToken = null
		persistSession(null, null)
		notifyListeners(null)
	}

	const getToken = async (): Promise<string | null> => {
		if (currentToken) return currentToken

		const stored = loadPersistedToken()
		if (stored) {
			currentToken = stored
			return stored
		}

		return null
	}

	const refreshToken = async (): Promise<string | null> => {
		try {
			const session = await client.getSession()
			if (session.data) {
				currentUser = toAuthUser(session.data as SessionData)
				currentToken = extractToken(session.data) ?? await getTokenFromSession()
				persistSession(currentToken, currentUser)
				return currentToken
			}
		} catch {
			// Cookie session failed
		}

		const token = currentToken ?? loadPersistedToken()
		if (!token) return null

		const valid = await validateStoredSession(token)
		if (valid) {
			persistSession(currentToken, currentUser)
			return currentToken
		}

		persistSession(null, null)
		return null
	}

	const getCurrentUser = (): AuthUser | null => {
		if (currentUser) return currentUser
		return loadPersistedUser()
	}

	const isAuthenticated = (): boolean => {
		return currentUser !== null || loadPersistedToken() !== null
	}

	const onAuthStateChanged = (listener: AuthStateListener): (() => void) => {
		listeners.add(listener)
		const user = currentUser ?? loadPersistedUser()
		listener(user)
		return () => {
			listeners.delete(listener)
		}
	}

	const sendPasswordResetEmail = async (email: string, redirectUrl: string) => {
		const result = await client.$fetch('/api/auth/request-password-reset', {
			method: 'POST',
			body: { email, redirectTo: redirectUrl },
		})
		if (result.error) {
			throw new Error('Failed to send reset email')
		}
	}

	const confirmPasswordReset = async (code: string, newPassword: string) => {
		const result = await client.$fetch('/api/auth/reset-password', {
			method: 'POST',
			body: { newPassword, token: code },
		})
		if (result.error) {
			throw new Error('Failed to reset password')
		}
	}

	const verifyPasswordResetCode = async (_code: string): Promise<string> => {
		return ''
	}

	const signInWithCustomToken = async (token: string) => {
		const valid = await validateStoredSession(token)
		if (!valid || !currentUser) {
			throw new Error('Invalid or expired session token')
		}
		persistSession(currentToken, currentUser)
		notifyListeners(currentUser)
		return { user: currentUser, token: currentToken ?? token }
	}

	return {
		features,
		initialize,
		login,
		signup,
		logout,
		getToken,
		refreshToken,
		getCurrentUser,
		isAuthenticated,
		onAuthStateChanged,
		sendPasswordResetEmail,
		confirmPasswordReset,
		verifyPasswordResetCode,
		signInWithCustomToken,
	}
}

export { createBetterAuthClient as default }
