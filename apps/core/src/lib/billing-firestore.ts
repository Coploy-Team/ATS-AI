import type { StripeCustomer, StripeSubscription } from '@/types/billing'
import type { InfraProvider } from '@coploy/infra'
import type { Company } from '@coploy/domain'

export function createBillingFirestoreService(infra: InfraProvider) {
	return {
		/**
		 * Buscar empresa por Stripe Customer ID
		 */
		async getCompanyByStripeCustomerId(
			customerId: string,
		): Promise<Company | null> {
			const companies = (await infra.companyRepository.listCompanies({
				filters: [
					{
						field: 'subscriptionDetails.stripeCustomerId',
						operator: '==',
						value: customerId,
					},
				],
				limitTo: 1,
			})) as Company[]

			return companies.length > 0 ? companies[0] : null
		},

		/**
		 * Buscar empresa por Subscription ID
		 */
		async getCompanyBySubscriptionId(
			subscriptionId: string,
		): Promise<Company | null> {
			const companies = (await infra.companyRepository.listCompanies({
				filters: [
					{ field: 'subscriptionId', operator: '==', value: subscriptionId },
				],
				limitTo: 1,
			})) as Company[]

			return companies.length > 0 ? companies[0] : null
		},

		/**
		 * Limpar dados de subscription da empresa
		 */
		async clearCompanySubscription(companyId: string): Promise<void> {
			await infra.companyRepository.updateCompany(companyId, {
				subscriptionId: undefined,
				subscriptionStatus: 'canceled' as Company['subscriptionStatus'],
				subscriptionPlan: undefined,
				currentPeriodEnd: undefined,
				trialEnd: undefined,
			})
		},

		/**
		 * Verificar se empresa tem subscription ativa
		 */
		async hasActiveSubscription(companyId: string): Promise<boolean> {
			const company = (await infra.companyRepository.getCompany(companyId)) as Company | null

			if (!company?.subscriptionStatus) {
				return false
			}

			const activeStatuses = ['active', 'trialing']
			return activeStatuses.includes(company.subscriptionStatus)
		},

		/**
		 * Listar empresas com subscriptions expiradas
		 */
		async getExpiredSubscriptions(): Promise<Company[]> {
			const now = Math.floor(Date.now() / 1000)

			const companies = (await infra.companyRepository.listCompanies({
				filters: [
					{ field: 'currentPeriodEnd', operator: '<', value: now },
					{ field: 'subscriptionStatus', operator: '==', value: 'active' },
				],
			})) as Company[]

			return companies
		},

		/**
		 * Listar empresas em período de trial que expira em X dias
		 */
		async getTrialExpiringIn(days: number): Promise<Company[]> {
			const targetDate = Math.floor(
				(Date.now() + days * 24 * 60 * 60 * 1000) / 1000,
			)
			const todayStart = Math.floor(Date.now() / 1000)

			const companies = (await infra.companyRepository.listCompanies({
				filters: [
					{ field: 'trialEnd', operator: '>=', value: todayStart },
					{ field: 'trialEnd', operator: '<=', value: targetDate },
					{ field: 'subscriptionStatus', operator: '==', value: 'trialing' },
				],
			})) as Company[]

			return companies
		},

		/**
		 * Salvar dados de customer para auditoria/backup
		 */
		async saveCustomerData(
			companyId: string,
			customerData: Partial<StripeCustomer>,
		): Promise<void> {
			// Salvar em uma subcoleção para histórico
			await infra.billingRepository.createBillingHistory(companyId, {
				type: 'customer_created',
				data: customerData,
				timestamp: Date.now(),
			})
		},

		/**
		 * Salvar dados de subscription para auditoria/backup
		 */
		async saveSubscriptionData(
			companyId: string,
			subscriptionData: Partial<StripeSubscription>,
			action: 'created' | 'updated' | 'canceled',
		): Promise<void> {
			// Salvar em uma subcoleção para histórico
			await infra.billingRepository.createBillingHistory(companyId, {
				type: `subscription_${action}`,
				data: subscriptionData,
				timestamp: Date.now(),
			})
		},

		/**
		 * Buscar histórico de billing de uma empresa
		 */
		async getBillingHistory(companyId: string, limit = 50): Promise<any[]> {
			return await infra.billingRepository.listBillingHistory(companyId, {
				orderByField: 'timestamp',
				orderDirection: 'desc',
				limitTo: limit,
			})
		},
	}
}

