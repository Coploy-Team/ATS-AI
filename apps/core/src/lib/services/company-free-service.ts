import {
	COMPANY_FREE_DEFAULTS,
	CREDITS_HISTORY_REASON,
	CREDITS_HISTORY_TYPE,
	DICEBEAR_LOGO_URL,
	FIREBASE_AUTH_ERRORS,
	getDiceBearAvatarUrl,
} from '@/http/constants/company-free-constants'
import { BadRequestError } from '@coploy/shared/errors'
import { authService } from '@/lib/init'
import { removeUndefinedFields } from '@/lib/remove-undefined-fields'
import { secureLogger } from '@coploy/shared/utils'
import type { InfraProvider } from '@coploy/infra'
import type { Company } from '@coploy/domain'
import type {
	AuthCreatedUser,
	CompanyCreationResult,
	CompanyFreeCompanyData,
	CompanyFreeUserData,
} from '@/types/company-free'

/**
 * Gera um slug único para a empresa
 */
export function generateSlug(companyName: string): string {
	// Gera um hash pequeno baseado no timestamp atual
	const timestamp = Date.now()
	const hash = timestamp.toString(36).slice(-6) // Últimos 6 caracteres do timestamp em base36

	const baseSlug = companyName
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Remove acentos
		.replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por hífen
		.replace(/(^-+)|(-+$)/g, '') // Remove hífens do início e fim
		.slice(0, 30) // Limita o tamanho do slug base

	return `${baseSlug}-${hash}`
}

/**
 * Divide o nome completo em primeiro nome e sobrenome
 */
export function splitFullName(fullName: string): {
	firstName: string
	lastName: string
} {
	const names = fullName.trim().split(' ')
	const firstName = names[0] || ''
	const lastName = names.slice(1).join(' ') || ''
	return { firstName, lastName }
}

/**
 * Cria um usuário no sistema de autenticação (Firebase Auth ou BetterAuth)
 */
export async function createUserInAuth(
	userData: CompanyFreeUserData,
): Promise<{ uid: string; email: string }> {
	try {
		const userRecord = await authService.createUser({
			email: userData.email,
			password: userData.password,
			displayName: userData.fullName,
		})

		return {
			uid: userRecord.uid,
			email: userRecord.email || userData.email,
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error)

		for (const [code, friendlyMessage] of Object.entries(FIREBASE_AUTH_ERRORS)) {
			if (message.includes(code)) {
				throw new BadRequestError(friendlyMessage)
			}
		}

		console.error('[createUserInAuth] Failed:', message)
		throw new BadRequestError(`Erro ao criar usuário: ${message}`)
	}
}

/**
 * Cria dados da empresa para o Firestore
 */
export function createCompanyDataForFirestore(
	userCredential: { uid: string; email: string },
	companyData: CompanyFreeCompanyData,
): any {
	const companySlug = generateSlug(companyData.name)

	return removeUndefinedFields({
		companLogo:
			companyData.logoUrl || `${DICEBEAR_LOGO_URL}${companyData.name}`,
		companyBio: COMPANY_FREE_DEFAULTS.COMPANY_BIO,
		companyName: companyData.name,
		companyCity: companyData.location,
		companyCountry: COMPANY_FREE_DEFAULTS.COMPANY_COUNTRY,
		companyId: companySlug,
		companySize: companyData.employees,
		companyState: companyData.location,
		companyWebsite: companyData.website,
		/*
		 * ownerCompany NÃO entra aqui: no Postgres a coluna tem FK para
		 * users_company, que só é criado no passo seguinte — gravar o owner no
		 * INSERT viola o constraint. O passo 5 (updateCompanyOwner) grava o
		 * owner depois que o users_company existe, em todos os providers.
		 */
		companyInterviews: COMPANY_FREE_DEFAULTS.COMPANY_INTERVIEWS,
		infoJobs: COMPANY_FREE_DEFAULTS.INFO_JOBS,
		jobPortal: COMPANY_FREE_DEFAULTS.JOB_PORTAL,
		segment: companyData.segment,
		objective: companyData.objective,
		typeInterview: companyData.typeInterview,
		notificationsEmail: companyData.notificationsEmail,
		notificationReportWeek: companyData.notificationReportWeek,
		headquartersCountries: companyData.headquartersCountries,
		evaluateInternationalCandidates: companyData.evaluateInternationalCandidates,
		// ✅ Feature flags: Configurações de funcionalidades da empresa
		features: {
			useEngineProcessing: true, // Usar coploy-engine para processamento de entrevistas
		},
		/*
		 * Empresa nascida no ATS v2 já entra com as capacidades do v2 ligadas.
		 *
		 * `applyLite` deixou de ser experimento: é o formulário de candidatura, e
		 * sem ele o filtro de candidatura não tem onde ser perguntado e a coluna
		 * "Candidatura" do pipeline nunca recebe ninguém. Quem se cadastra hoje
		 * espera o produto que a página vendeu, não um subconjunto dele.
		 *
		 * `antiGhosting` pelo mesmo motivo: a régua de resposta ao candidato é
		 * argumento de venda do v2, não opção escondida.
		 *
		 * Empresas antigas seguem com o que já tinham — isto vale só na criação.
		 */
		featureFlags: {
			applyLite: true,
			antiGhosting: true,
		},
		subscriptionDetails: {
			stripeCustomerId: COMPANY_FREE_DEFAULTS.STRIPE_CUSTOMER_ID,
			plan: COMPANY_FREE_DEFAULTS.PLAN,
			status: COMPANY_FREE_DEFAULTS.STATUS,
			startAt: new Date().toISOString(),
		},
		subscriptionCredits: {
			creditsMonthly: COMPANY_FREE_DEFAULTS.CREDITS_MONTHLY,
			creditsFixed: COMPANY_FREE_DEFAULTS.CREDITS_FIXED,
			creditsCourtesy: COMPANY_FREE_DEFAULTS.CREDITS_COURTESY,
		},
		subscriptionTrial: {
			courtesyCreditsGranted: COMPANY_FREE_DEFAULTS.CREDITS_COURTESY,
			startAt: new Date().toISOString(),
		},
	})
}

export function createHistoryCreditsDataForFirestore(): any {
	return {
		type: CREDITS_HISTORY_TYPE.grant,
		credits: COMPANY_FREE_DEFAULTS.CREDITS_COURTESY,
		reason: CREDITS_HISTORY_REASON.courtesy_credits,
	}
}

/**
 * Cria dados do usuário para o Firestore
 */
export function createUserCompanyData(
	userCredential: { uid: string; email: string },
	userData: CompanyFreeUserData,
	firstName: string,
	lastName: string,
	companyId: string,
): any {
	return removeUndefinedFields({
		uuid: userCredential.uid,
		company: companyId,
		created_time: new Date(),
		display_name: userData.fullName,
		email: userData.email,
		first_name: firstName,
		is_owner: true,
		last_name: lastName,
		occupation: userData.occupation,
		phone_number: userData.phone,
		photo_url: getDiceBearAvatarUrl(userData.fullName || userData.email),
		jobsApplied: COMPANY_FREE_DEFAULTS.JOBS_APPLIED,
	})
}

/**
 * Faz rollback em caso de erro
 */
export async function rollbackCreation(
	companyDoc: (Company & { id: string }) | null,
	createdUser: AuthCreatedUser | null,
): Promise<void> {
	try {
		if (companyDoc?.id) {
			console.warn('[Rollback] Company deletion not yet implemented in repository pattern', { companyId: companyDoc.id })
			secureLogger.info(
				'Rollback: Company deletion skipped - not yet implemented in repository pattern',
				{ companyId: companyDoc.id },
			)
		}

		if (createdUser?.uid) {
			try {
				await authService.deleteUser(createdUser.uid)
				secureLogger.info('Rollback: Deleted user from Auth', {
					userId: createdUser.uid,
				})
			} catch (authError) {
				secureLogger.error('Rollback: Failed to delete user from Auth', {
					userId: createdUser.uid,
					error: authError,
				})
			}
		}
	} catch (rollbackError) {
		throw new BadRequestError(
			`Error during rollback: ${rollbackError as string}`,
		)
	}
}

export function createCompanyFreeService(infra: InfraProvider) {
	const service = {
		/**
		 * Cria a empresa no Firestore
		 */
		async createCompanyInFirestore(
			userCredential: { uid: string; email: string },
			companyData: CompanyFreeCompanyData,
		): Promise<Company & { id: string }> {
			const companyDataForFirestore = createCompanyDataForFirestore(
				userCredential,
				companyData,
			)
			const companySlug = generateSlug(companyData.name)

			const company = (await infra.companyRepository.createCompany(
				companyDataForFirestore,
				companySlug,
			)) as Company & { id: string }

			return company
		},

		/**
		 * Cria o usuário na collection usersCompany
		 */
		async createUserCompanyInFirestore(
			userCredential: { uid: string; email: string },
			userData: CompanyFreeUserData,
			firstName: string,
			lastName: string,
			companyId: string,
		): Promise<void> {
			const userCompanyData = createUserCompanyData(
				userCredential,
				userData,
				firstName,
				lastName,
				companyId,
			)
			await infra.userRepository.createUsersCompany(
				userCompanyData,
				userCredential.uid,
			)
		},

		/**
		 * Atualiza a empresa com a referência do owner
		 */
		async updateCompanyOwner(
			companyId: string,
			userCredential: { uid: string; email: string },
		): Promise<void> {
			await infra.companyRepository.updateCompany(companyId, {
				ownerCompany: userCredential.uid as string,
			})
		},

		/**
		 * Registra quem abriu a conta como colaborador `owner`.
		 */
		async createOwnerCollaborator(
			companyId: string,
			userCredential: { uid: string; email: string },
			userData: CompanyFreeUserData,
		): Promise<void> {
			await infra.collaboratorRepository.createCollaborator(companyId, {
				name: userData.fullName,
				email: userData.email,
				accessLevel: 'owner',
				status: true,
				creationDate: new Date(),
				userRef: { id: userCredential.uid },
			} as never)
		},

		/**
		 * Processo completo de criação de empresa e usuário
		 */
		async createCompanyAndUser(
			userData: CompanyFreeUserData,
			companyData: CompanyFreeCompanyData,
		): Promise<CompanyCreationResult> {
			// 1. Criar usuário no Firebase Auth
			const userCredential = await createUserInAuth(userData)

			// 2. Dividir nome completo
			const { firstName, lastName } = splitFullName(userData.fullName)

			// 3. Criar a empresa
			const company = await service.createCompanyInFirestore(userCredential, companyData)

			if (!company?.id) {
				throw new BadRequestError('Erro ao criar empresa')
			}

			// 4. Criar registro do usuário na collection usersCompany
			await service.createUserCompanyInFirestore(
				userCredential,
				userData,
				firstName,
				lastName,
				company.id,
			)

			// 5. Atualizar a empresa com a referência do owner
			await service.updateCompanyOwner(company.id, userCredential)

			/*
			 * 6. Quem abriu a conta entra no time como owner.
			 *
			 * Sem isto a empresa nasce com o time vazio: `is_owner` fica só no
			 * documento do usuário, e a tela de Time (v1 e v2) lista
			 * `collaborators`. Falhar aqui não desfaz a empresa — a conta está
			 * criada e funciona; a listagem sintetiza o dono quando o documento
			 * não existe.
			 */
			await service
				.createOwnerCollaborator(company.id, userCredential, userData)
				.catch((erro) => {
					secureLogger.warn('Falha ao criar colaborador do owner', {
						companyId: company.id,
						erro: erro instanceof Error ? erro.message : String(erro),
					})
				})

			return { user: userCredential, company }
		},
	}
	return service
}

