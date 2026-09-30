import type { InfraProvider } from '@coploy/infra'
import type { Company, UpdateInput } from '@coploy/domain'
import {
	COMPANY_FREE_DEFAULTS,
	COMPANY_PLANS,
} from '@/http/constants/company-free-constants'
import { isPastDate } from '@/lib/date-formatter'
import { stripProtectedCompanyFields } from '@/schemas/companies-schema'

/**
 * Generates a URL-friendly slug from a company name
 */
export function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '')
		.trim()
}

/**
 * Splits a full name into first and last name components
 */
export function splitFullName(fullName: string): {
	firstName: string
	lastName: string
} {
	const parts = fullName.split(' ')
	if (parts.length === 1) {
		return { firstName: parts[0], lastName: parts[0] }
	}
	return {
		firstName: parts[0],
		lastName: parts.slice(1).join(' '),
	}
}

/**
 * Normalizes subscription plan and credits for a company response.
 * Handles expired plans by resetting to free and zeroing monthly credits.
 */
function normalizeCompanyResponse(company: Company) {
	const subscriptionDetails = company.subscriptionDetails ?? {}
	const subscriptionCredits = company.subscriptionCredits ?? {}
	const subscriptionPlan = company.subscriptionPlan

	// Normalize plan
	// `subscriptionDetails.plan` é a fonte canônica atualizada pelos webhooks Stripe.
	// `subscriptionPlan` (raiz) é um campo legacy populado apenas no signup
	// (create-company-free) e que nunca é atualizado depois — fica como fallback
	// para Companies criadas Free que ainda não passaram por nenhum webhook.
	const basePlan =
		subscriptionDetails.plan || subscriptionPlan || COMPANY_PLANS.free

	const isPaidPlan = ['pro', 'premium'].includes(String(basePlan).toLowerCase())
	const planExpired = isPastDate(subscriptionDetails.endAt as string | Date | null | undefined)

	const normalizedPlan =
		isPaidPlan && planExpired ? COMPANY_PLANS.free : basePlan

	// Normalize credits
	const creditsMonthlyRaw = subscriptionCredits.creditsMonthly || 0
	const creditsFixed = subscriptionCredits.creditsFixed || 0
	const creditsCourtesy = subscriptionCredits.creditsCourtesy || 0

	const creditsMonthly = planExpired ? 0 : creditsMonthlyRaw
	const creditsTotal = creditsMonthly + creditsFixed + creditsCourtesy

	const toIsoString = (d: Date | string | null | undefined): string | null =>
		d instanceof Date ? d.toISOString() : (d ?? null)

	const sd = {
		...subscriptionDetails,
		plan: normalizedPlan,
		status: subscriptionDetails.status ?? COMPANY_FREE_DEFAULTS.STATUS,
		startAt: toIsoString(subscriptionDetails.startAt),
		endAt: toIsoString(subscriptionDetails.endAt),
	}

	const trialEnd = (company as any).trialEnd as number | null | undefined
	const trialExpired = !!(sd.status === 'trialing' && trialEnd && trialEnd * 1000 < Date.now())
	const effectiveStatus = trialExpired ? 'canceled' : sd.status
	sd.status = effectiveStatus

	const trial = company.subscriptionTrial
		? {
				...company.subscriptionTrial,
				startAt: toIsoString(company.subscriptionTrial.startAt),
				grantedAt: toIsoString(company.subscriptionTrial.grantedAt),
			}
		: company.subscriptionTrial

	return {
		...company,
		plan: sd.plan ?? COMPANY_FREE_DEFAULTS.PLAN,
		subscriptionPlan: sd.plan ?? subscriptionPlan ?? undefined,
		subscriptionStatus: effectiveStatus ?? undefined,
		trialExpired,
		stripeCustomerId: sd.stripeCustomerId ?? company.stripeCustomerId ?? undefined,
		subscriptionDetails: sd,
		subscriptionTrial: trial,
		subscriptionCredits: {
			...subscriptionCredits,
			creditsMonthly,
			creditsFixed,
			creditsCourtesy,
			creditsTotal,
		},
	}
}

export function createCompanyService(infra: InfraProvider) {
	return {
		async getCompany(companyId: string) {
			const company = await infra.companyRepository.getCompany(companyId)
			if (!company) throw new Error('Company not found')
			return normalizeCompanyResponse(company)
		},

		async createCompany(data: UpdateInput<Company>) {
			const safeData = stripProtectedCompanyFields(data as Record<string, unknown>)
			const slug = generateSlug(safeData.companyName as string)
			const company = await infra.companyRepository.createCompany(
				{
					...safeData,
					companLogo: '',
					features: { useEngineProcessing: true },
				} as UpdateInput<Company>,
				slug,
			)
			return company
		},

		async updateCompany(companyId: string, data: UpdateInput<Company>, currentLogo?: string) {
			const safeData = stripProtectedCompanyFields(data as Record<string, unknown>)
			const updatedData = {
				...safeData,
				companLogo: currentLogo,
			}
			await infra.companyRepository.updateCompany(companyId, updatedData as UpdateInput<Company>)
			const updated = await infra.companyRepository.getCompany(companyId)
			if (!updated) throw new Error('Failed to retrieve updated company')
			return normalizeCompanyResponse(updated)
		},

		async patchCompany(companyId: string, data: UpdateInput<Company>) {
			const entrada = data as Record<string, unknown>
			const safeData = stripProtectedCompanyFields(entrada) as Record<string, unknown>

			/*
			 * O LOGO passa por aqui — e só por aqui.
			 *
			 * `companLogo` está na lista de protegidos porque existia uma rota
			 * dedicada multipart para trocá-lo. Quando o PATCH passou a aceitar a
			 * URL (o contrato público não descreve multipart, então o SDK não gera
			 * a outra), ninguém tirou o campo da lista: a rota aceitava, o service
			 * apagava antes de gravar e a resposta vinha 200 com o logo velho.
			 * Salvava sem salvar.
			 *
			 * Reabrir só neste método mantém `PUT /companies` e a criação exatamente
			 * como estão — a v1 usa aquele caminho e não pode mudar. A exposição é a
			 * mesma do `photoUrl` do perfil: uma URL de imagem que o próprio dono da
			 * empresa escolhe.
			 */
			if (typeof entrada.companLogo === 'string') {
				safeData.companLogo = entrada.companLogo
			}
			const existing = await infra.companyRepository.getCompany(companyId)
			if (!existing) throw new Error('Company not found')
			await infra.companyRepository.updateCompany(companyId, safeData as UpdateInput<Company>)
			const updated = await infra.companyRepository.getCompany(companyId)
			if (!updated) throw new Error('Failed to retrieve updated company')
			return normalizeCompanyResponse(updated)
		},

		async uploadLogo(companyId: string, buffer: Buffer, mimetype: string) {
			const logoUrl = await infra.storage.uploadFile(buffer, 'companies', companyId, mimetype)
			await infra.companyRepository.updateCompany(companyId, { companLogo: logoUrl })
			const updated = await infra.companyRepository.getCompany(companyId)
			if (!updated) throw new Error('Failed to retrieve updated company')
			return normalizeCompanyResponse(updated)
		},
	}
}

