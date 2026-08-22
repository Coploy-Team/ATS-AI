export type AuthUser = {
	uid: string
	email: string | null
	displayName: string | null
	phoneNumber: string | null
	photoURL: string | null
}

export type AuthFeatures = {
	phoneAuth: boolean
	recaptcha: boolean
	customToken: boolean
	passwordReset: boolean
	emailSignup: boolean
}

export type AuthStateListener = (user: AuthUser | null) => void

export type AuthClient = {
	readonly features: AuthFeatures

	initialize(): Promise<void>
	login(email: string, password: string): Promise<{ user: AuthUser; token: string }>
	signup(email: string, password: string, name?: string): Promise<{ user: AuthUser; token: string }>
	logout(): Promise<void>
	getToken(): Promise<string | null>
	refreshToken(): Promise<string | null>
	getCurrentUser(): AuthUser | null
	isAuthenticated(): boolean
	onAuthStateChanged(listener: AuthStateListener): () => void

	sendPasswordResetEmail(email: string, redirectUrl: string): Promise<void>
	confirmPasswordReset(code: string, newPassword: string): Promise<void>
	verifyPasswordResetCode(code: string): Promise<string>

	signInWithCustomToken?(token: string): Promise<{ user: AuthUser; token: string }>
	updateProfile?(data: { displayName?: string; photoURL?: string }): Promise<void>
}
