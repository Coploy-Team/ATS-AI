import type { CandidateProfile, CreateInput, UpdateInput, User, UsersCompany } from '@coploy/domain'

export interface UserRepository {
	getUser(id: string): Promise<User | null>
	updateUser(id: string, data: UpdateInput<User>): Promise<void>
	createUser(data: CreateInput<User>, customId?: string): Promise<User & { id: string }>
	getUsersCompany(id: string): Promise<UsersCompany | null>
	createUsersCompany(data: CreateInput<UsersCompany>, customId: string): Promise<UsersCompany & { id: string }>
	updateUsersCompany(id: string, data: UpdateInput<UsersCompany>): Promise<void>
	deleteUsersCompany(id: string): Promise<void>
	getCandidateProfile(id: string): Promise<CandidateProfile | null>
	createCandidateProfile(data: CreateInput<CandidateProfile>, customId: string): Promise<CandidateProfile & { id: string }>
	updateCandidateProfile(id: string, data: UpdateInput<CandidateProfile>): Promise<void>
	findUserByPhone(phone: string): Promise<User | null>
	findUserByEmail(email: string): Promise<User | null>
	deleteUser(id: string): Promise<void>
}