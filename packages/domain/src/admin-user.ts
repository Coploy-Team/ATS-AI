export type AdminRole = 'admin_master' | 'suporte' | 'comercial'

export interface AdminUser {
	/** Document id — normalized email (lowercased). */
	id: string
	email: string
	name: string
	role: AdminRole
	mfaEnabled?: boolean | null
	createdAt?: Date | null
	lastSeenAt?: Date | null
}
