import {
	browserLocalPersistence,
	browserSessionPersistence,
	confirmPasswordReset as fbConfirmPasswordReset,
	createUserWithEmailAndPassword,
	getAuth,
	getIdToken,
	inMemoryPersistence,
	onAuthStateChanged as fbOnAuthStateChanged,
	sendPasswordResetEmail as fbSendPasswordResetEmail,
	setPersistence,
	signInWithCustomToken as fbSignInWithCustomToken,
	signInWithEmailAndPassword,
	signOut,
	updateProfile as fbUpdateProfile,
	verifyPasswordResetCode as fbVerifyPasswordResetCode,
} from 'firebase/auth'
import type { FirebaseApp } from 'firebase/app'
import type { AuthClient, AuthFeatures, AuthStateListener, AuthUser } from '../types'

function toAuthUser(fbUser: { uid: string; email: string | null; displayName: string | null; phoneNumber: string | null; photoURL: string | null }): AuthUser {
	return {
		uid: fbUser.uid,
		email: fbUser.email,
		displayName: fbUser.displayName,
		phoneNumber: fbUser.phoneNumber,
		photoURL: fbUser.photoURL,
	}
}

type FirebaseAuthConfig = {
	app: FirebaseApp
}

export function createFirebaseAuthClient(config: FirebaseAuthConfig): AuthClient {
	const firebaseAuth = getAuth(config.app)

	const features: AuthFeatures = {
		phoneAuth: true,
		recaptcha: true,
		customToken: true,
		passwordReset: true,
		emailSignup: true,
	}

	const initialize = async (): Promise<void> => {
		try {
			await setPersistence(firebaseAuth, browserLocalPersistence)
		} catch {
			try {
				await setPersistence(firebaseAuth, browserSessionPersistence)
			} catch {
				try {
					await setPersistence(firebaseAuth, inMemoryPersistence)
				} catch {
					// Firebase will use its default persistence
				}
			}
		}
	}

	const login = async (email: string, password: string) => {
		const credential = await signInWithEmailAndPassword(firebaseAuth, email, password)
		const token = await credential.user.getIdToken()
		return { user: toAuthUser(credential.user), token }
	}

	const signup = async (email: string, password: string, name?: string) => {
		const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
		if (name) {
			await fbUpdateProfile(credential.user, { displayName: name })
		}
		const token = await credential.user.getIdToken()
		return { user: toAuthUser(credential.user), token }
	}

	const logout = async () => {
		await signOut(firebaseAuth)
	}

	const getToken = async (): Promise<string | null> => {
		const user = firebaseAuth.currentUser
		if (!user) return null
		return getIdToken(user)
	}

	const refreshToken = async (): Promise<string | null> => {
		const user = firebaseAuth.currentUser
		if (!user) return null
		return getIdToken(user, true)
	}

	const getCurrentUser = (): AuthUser | null => {
		const user = firebaseAuth.currentUser
		return user ? toAuthUser(user) : null
	}

	const isAuthenticated = (): boolean => {
		return firebaseAuth.currentUser !== null
	}

	const onAuthStateChanged = (listener: AuthStateListener): (() => void) => {
		return fbOnAuthStateChanged(firebaseAuth, (user) => {
			listener(user ? toAuthUser(user) : null)
		})
	}

	const sendPasswordResetEmail = async (email: string, redirectUrl: string) => {
		await fbSendPasswordResetEmail(firebaseAuth, email, {
			url: redirectUrl,
			handleCodeInApp: true,
		})
	}

	const confirmPasswordReset = async (code: string, newPassword: string) => {
		await fbConfirmPasswordReset(firebaseAuth, code, newPassword)
	}

	const verifyPasswordResetCode = async (code: string): Promise<string> => {
		return fbVerifyPasswordResetCode(firebaseAuth, code)
	}

	const signInWithCustomToken = async (token: string) => {
		const credential = await fbSignInWithCustomToken(firebaseAuth, token)
		const idToken = await credential.user.getIdToken()
		return { user: toAuthUser(credential.user), token: idToken }
	}

	const updateProfileFn = async (data: { displayName?: string; photoURL?: string }) => {
		const user = firebaseAuth.currentUser
		if (!user) throw new Error('No authenticated user')
		await fbUpdateProfile(user, data)
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
		updateProfile: updateProfileFn,
	}
}

export { createFirebaseAuthClient as default }
