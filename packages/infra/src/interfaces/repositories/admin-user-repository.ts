import type { AdminUser, CreateInput, UpdateInput } from '@coploy/domain'

export interface AdminUserRepository {
	getByEmail(email: string): Promise<AdminUser | null>
	list(): Promise<AdminUser[]>
	create(data: CreateInput<AdminUser>, customId?: string): Promise<AdminUser & { id: string }>
	update(id: string, data: UpdateInput<AdminUser>): Promise<void>
	delete(id: string): Promise<void>
}
