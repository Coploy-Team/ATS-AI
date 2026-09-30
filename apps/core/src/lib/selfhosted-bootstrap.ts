import type { InfraProvider } from '@coploy/infra'
import type { Company, UsersCompany } from '@coploy/domain'
import { getDiceBearAvatarUrl } from '@/http/constants/company-free-constants'

export type SelfHostedBootstrapConfig = {
	enabled: boolean
	adminEmail: string
	adminPassword: string
	adminName: string
	companyId: string
	companyName: string
}

function splitName(fullName: string): { firstName: string; lastName: string } {
	const parts = fullName.trim().split(/\s+/).filter(Boolean)
	return {
		firstName: parts[0] ?? 'Admin',
		lastName: parts.slice(1).join(' ') || 'User',
	}
}

export async function ensureSelfHostedAdminSeed(
	infra: InfraProvider,
	config: SelfHostedBootstrapConfig,
): Promise<void> {
	if (!config.enabled) return

	let user = await infra.auth.getUserByEmail(config.adminEmail)
	if (!user) {
		user = await infra.auth.createUser({
			email: config.adminEmail,
			password: config.adminPassword,
			displayName: config.adminName,
		})
		console.info(`[SelfHosted] Bootstrap admin auth user created (${config.adminEmail})`)
	}

	const userId = user.uid
	const nowIso = new Date().toISOString()
	const { firstName, lastName } = splitName(config.adminName)

	// Ordem: users_company primeiro (companies.ownerUserCompanyId referencia users_company.id)
	// Depois company, depois atualizar users_company com company_id
	const existingUserCompany = await infra.userRepository.getUsersCompany(userId)
	if (!existingUserCompany) {
		await infra.userRepository.createUsersCompany(
			{
				uuid: userId,
				email: config.adminEmail,
				display_name: config.adminName,
				first_name: firstName,
				last_name: lastName,
				occupation: 'Administrator',
				phone_number: '',
				photo_url: getDiceBearAvatarUrl(config.adminName || config.adminEmail),
				is_owner: true,
				created_time: new Date(nowIso),
				jobsApplied: [],
			} as unknown as Omit<UsersCompany, 'id'>,
			userId,
		)
		console.info(`[SelfHosted] Bootstrap usersCompany created (${userId})`)
	}

	const existingCompany = await infra.companyRepository.getCompany(config.companyId)
	if (!existingCompany) {
		await infra.companyRepository.createCompany(
			{
				companyId: config.companyId,
				companyName: config.companyName,
				companyBio: 'Self-hosted bootstrap enterprise account',
				companyCountry: 'Brasil',
				companyState: 'SP',
				companyCity: 'Sao Paulo',
				companySize: '1-10',
				companLogo: `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(config.companyName)}`,
				ownerCompany: { id: userId },
				companyInterviews: [],
				infoJobs: [],
				jobPortal: null,
				segment: 'tecnologia',
				objective: ['hire'],
				typeInterview: ['behavioral'],
				notificationsEmail: false,
				notificationReportWeek: false,
				headquartersCountries: ['BR'],
				evaluateInternationalCandidates: false,
				features: { useEngineProcessing: true },
				subscriptionPlan: 'enterprise',
				subscriptionDetails: {
					plan: 'enterprise',
					status: 'active',
					startAt: new Date(nowIso),
					stripeCustomerId: '',
				},
				subscriptionCredits: {
					creditsMonthly: 0,
					creditsFixed: 0,
					creditsCourtesy: 0,
				},
				subscriptionTrial: {
					courtesyCreditsGranted: 0,
					startAt: new Date(nowIso),
				},
			} as unknown as Omit<Company, 'id'>,
			config.companyId,
		)
		console.info(`[SelfHosted] Bootstrap company created (${config.companyId})`)
	} else {
		type UpdateData = Parameters<typeof infra.companyRepository.updateCompany>[1]
		await infra.companyRepository.updateCompany(config.companyId, {
			subscriptionPlan: 'enterprise',
			'subscriptionDetails.plan': 'enterprise',
			'subscriptionDetails.status': 'active',
		} as unknown as UpdateData)
	}

	await infra.userRepository.updateUsersCompany(userId, {
		is_owner: true,
		company: { id: config.companyId },
	})
}
