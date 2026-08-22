import type { Auth } from 'firebase-admin/auth'

import type { AuthAdapter, CreateUserParams, DecodedToken, UpdateUserParams, UserRecord } from '../../interfaces/auth'

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'

export function createFirebaseAuthAdapter(auth: Auth, apiKey: string): AuthAdapter {
	return {
		async verifyToken(token: string): Promise<DecodedToken> {
			const decoded = await auth.verifyIdToken(token)
			return { uid: decoded.uid, email: decoded.email }
		},

		async createUser(params: CreateUserParams): Promise<UserRecord> {
			const user = await auth.createUser({
				email: params.email,
				password: params.password,
				displayName: params.displayName,
				phoneNumber: params.phoneNumber,
				photoURL: params.photoURL,
			})

			return {
				uid: user.uid,
				email: user.email,
				displayName: user.displayName,
				phoneNumber: user.phoneNumber,
				photoURL: user.photoURL,
			}
		},

		async getUserByEmail(email: string): Promise<UserRecord | null> {
			try {
				const user = await auth.getUserByEmail(email)
				return {
					uid: user.uid,
					email: user.email,
					displayName: user.displayName,
					phoneNumber: user.phoneNumber,
					photoURL: user.photoURL,
				}
			} catch (error) {
				const code = String((error as { code?: unknown })?.code ?? '')
				if (code === 'auth/user-not-found') return null
				throw error
			}
		},

		async getUserByPhone(phone: string): Promise<UserRecord | null> {
			try {
				const user = await auth.getUserByPhoneNumber(phone)
				return {
					uid: user.uid,
					email: user.email,
					displayName: user.displayName,
					phoneNumber: user.phoneNumber,
					photoURL: user.photoURL,
				}
			} catch (error) {
				const code = String((error as { code?: unknown })?.code ?? '')
				if (code === 'auth/user-not-found') return null
				throw error
			}
		},

		async deleteUser(uid: string): Promise<void> {
			await auth.deleteUser(uid)
		},

		async createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string> {
			return auth.createCustomToken(uid, claims)
		},

		async getUser(uid: string): Promise<UserRecord | null> {
			try {
				const user = await auth.getUser(uid)
				return {
					uid: user.uid,
					email: user.email,
					displayName: user.displayName,
					phoneNumber: user.phoneNumber,
					photoURL: user.photoURL,
				}
			} catch (error) {
				const code = String((error as { code?: unknown })?.code ?? '')
				if (code === 'auth/user-not-found') return null
				throw error
			}
		},

		async updateUser(uid: string, params: UpdateUserParams): Promise<UserRecord> {
			const update: Record<string, unknown> = {}
			if (params.email !== undefined) update.email = params.email
			if (params.displayName !== undefined) update.displayName = params.displayName
			if (params.phoneNumber !== undefined) update.phoneNumber = params.phoneNumber
			if (params.photoURL !== undefined) update.photoURL = params.photoURL
			// o Admin SDK faz o hash; o valor não passa por log nenhum aqui
			if (params.password !== undefined) update.password = params.password
			const user = await auth.updateUser(uid, update)
			return {
				uid: user.uid,
				email: user.email,
				displayName: user.displayName,
				phoneNumber: user.phoneNumber,
				photoURL: user.photoURL,
			}
		},

		async setUserDisabled(uid: string, disabled: boolean): Promise<void> {
			await auth.updateUser(uid, { disabled })
		},

		async generatePasswordResetLink(email: string, continueUrl?: string): Promise<string> {
			// ⚠️ `continueUrl` NÃO faz bypass do action handler — o comentário
			// anterior aqui afirmava isso e está errado. O link devolvido aponta
			// SEMPRE para a Auth Action URL configurada no Firebase Console (hoje
			// `interview.coploy.io/reset-password`), com o continueUrl apenas
			// pendurado como parâmetro. Quem quiser levar a pessoa a outra tela
			// precisa extrair o `oobCode` do link e montar o endereço por conta
			// (é o que o `password-service` do core faz).
			//
			// Custou um e-mail de homolog sair apontando para produção.
			if (!continueUrl) {
				return auth.generatePasswordResetLink(email)
			}
			return auth.generatePasswordResetLink(email, {
				url: continueUrl,
				handleCodeInApp: true,
			})
		},

		async signInWithPassword(email: string, password: string): Promise<string> {
			const response = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, returnSecureToken: true }),
			})

			if (!response.ok) {
				const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
				const message = error?.error?.message ?? 'INVALID_LOGIN_CREDENTIALS'
				if (
					message.includes('INVALID_LOGIN_CREDENTIALS') ||
					message.includes('EMAIL_NOT_FOUND') ||
					message.includes('INVALID_PASSWORD')
				) {
					throw new Error('Credenciais inválidas')
				}
				throw new Error(message)
			}

			const data = (await response.json()) as { idToken: string }
			return data.idToken
		},
	}
}
