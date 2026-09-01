import type { Company } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { buildEmailBranding, type EmailBranding } from '@/emails/branding'
import { createJobPortalService } from './job-portal-service'

/**
 * A marca que o CANDIDATO vê no e-mail (decisão 4 do ADR-009).
 *
 * Vem do portal de vagas que a empresa já configurou — logo e cor que ela
 * escolheu na tela Portal de vagas, mais o nome da empresa. Nada de campo
 * novo: se o portal está configurado pro candidato ver no navegador, é a
 * mesma marca que deve chegar na caixa de entrada dele.
 *
 * Falha em resolver devolve `null` e o e-mail sai com a marca Coploy — o
 * e-mail PRECISA sair; marca é acabamento, não pré-requisito (mesma régua do
 * template resolver).
 */

/** Uma resolução por empresa a cada 5 min: e-mail em lote não vira N leituras. */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; value: EmailBranding | null }>()

export function createEmailBrandingService(infra: InfraProvider) {
	const portals = createJobPortalService(infra)

	return {
		async forCompany(company: Company & { id: string }): Promise<EmailBranding | null> {
			const cached = cache.get(company.id)
			if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

			let value: EmailBranding | null = null
			try {
				const portal = (await portals.resolvePortal(company)) as {
					logoUrl?: string | null
					primaryColor?: string | null
				} | null
				value = buildEmailBranding({
					companyName: company.companyName,
					// logo do portal, com o logo da empresa como segunda escolha
					logoUrl: portal?.logoUrl ?? company.companLogo ?? null,
					primaryColor: portal?.primaryColor ?? null,
				})
			} catch (error) {
				console.error('[EmailBranding] failed to resolve company branding:', error)
				value = buildEmailBranding({ companyName: company.companyName })
			}

			cache.set(company.id, { at: Date.now(), value })
			return value
		},

		/**
		 * Mesma resolução partindo só do id — para os envios que não têm o
		 * objeto Company em mãos (ack do anti-ghosting, por exemplo).
		 */
		async forCompanyId(companyId: string): Promise<EmailBranding | null> {
			const cached = cache.get(companyId)
			if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value
			try {
				const company = (await infra.companyRepository.getCompany(companyId)) as
					| (Company & { id: string })
					| null
				if (!company) return null
				return await this.forCompany({ ...company, id: company.id ?? companyId })
			} catch (error) {
				console.error('[EmailBranding] failed to load company:', error)
				return null
			}
		},

		/** Configuração mudou (tela Portal de vagas) — a próxima leitura busca de novo. */
		invalidate(companyId: string) {
			cache.delete(companyId)
		},
	}
}

export type EmailBrandingService = ReturnType<typeof createEmailBrandingService>
