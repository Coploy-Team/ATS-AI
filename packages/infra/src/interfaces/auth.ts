export type DecodedToken = {
	uid: string
	email?: string
	[key: string]: unknown
}

export type CreateUserParams = {
	email: string
	password?: string
	displayName?: string
	phoneNumber?: string
	photoURL?: string
}

export type UserRecord = {
	uid: string
	email?: string
	displayName?: string
	phoneNumber?: string
	photoURL?: string
}

export type CreateUserAndGetTokenResult = {
	uid: string
	token: string
	refreshToken?: string
}

export type UpdateUserParams = {
	email?: string
	displayName?: string
	phoneNumber?: string | null
	photoURL?: string
	/**
	 * Nova senha, em texto puro — o provedor faz o hash.
	 *
	 * Só quem já provou ser o dono da conta chega aqui: o core exige a senha
	 * atual antes de chamar. Nunca registrar este valor em log.
	 */
	password?: string
}

export type AuthAdapter = {
	verifyToken(token: string): Promise<DecodedToken>
	createUser(params: CreateUserParams): Promise<UserRecord>
	getUserByEmail(email: string): Promise<UserRecord | null>
	getUserByPhone(phone: string): Promise<UserRecord | null>
	deleteUser(uid: string): Promise<void>
	createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string>
	/** Signs in with email and password, returning an authentication token. */
	signInWithPassword(email: string, password: string): Promise<string>
	/** Quando definido, cria o usuário e retorna token (ex.: BetterAuth). Caso contrário o core usa createUser + createCustomToken + exchange (Firebase). */
	createUserAndGetToken?(params: CreateUserParams): Promise<CreateUserAndGetTokenResult>
	/** Lookup by uid. Optional — fallback caller deve tratar undefined adapter. */
	getUser?(uid: string): Promise<UserRecord | null>
	/** Update auth fields (ex: linkar phone a um user existente). Optional. */
	updateUser?(uid: string, params: UpdateUserParams): Promise<UserRecord>
	/** Generate one-shot password reset link (Firebase). Optional — selfhosted may not support. */
	generatePasswordResetLink?(email: string, continueUrl?: string): Promise<string>
	/** Enable/disable user at the auth level. Optional — selfhosted may not support. */
	setUserDisabled?(uid: string, disabled: boolean): Promise<void>
}
