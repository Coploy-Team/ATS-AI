import { env } from '@/env'
import type { ShortLink } from '@coploy/domain'
import type { ShortLinkData } from '@/types/short-links'
import type { InfraProvider } from '@coploy/infra'

const BASE_INTERVIEW_URL = env.INTERVIEW_BASE_URL

const SHORT_URL_BASE = `${BASE_INTERVIEW_URL}/s`

/**
 * Constrói a URL original completa a partir dos dados
 */
export function buildOriginalUrl(data: ShortLinkData): string {
	const utmParams = new URLSearchParams()
	if (data.utmSource) utmParams.set('utm_source', data.utmSource)
	if (data.utmMedium) utmParams.set('utm_medium', data.utmMedium)
	if (data.utmCampaign) utmParams.set('utm_campaign', data.utmCampaign)
	if (data.utmContent) utmParams.set('utm_content', data.utmContent)

	const utmQuery = utmParams.toString() ? `?${utmParams.toString()}` : ''
	return `${BASE_INTERVIEW_URL}/job/${data.jobId}/company/${data.companyId}/${utmQuery}`
}

export function createUrlShortener(infra: InfraProvider) {
	/**
	 * Gera uma URL encurtada para uma entrevista
	 */
	async function createShortLink(data: ShortLinkData): Promise<string> {
		// Importar nanoid dinamicamente (compatível com CommonJS)
		const { nanoid } = await import('nanoid')

		// Gerar código único de 8 caracteres
		const code = nanoid(8)

		// Construir a URL original completa
		const utmParams = new URLSearchParams()
		if (data.utmSource) utmParams.set('utm_source', data.utmSource)
		if (data.utmMedium) utmParams.set('utm_medium', data.utmMedium)
		if (data.utmCampaign) utmParams.set('utm_campaign', data.utmCampaign)
		if (data.utmContent) utmParams.set('utm_content', data.utmContent)

		const utmQuery = utmParams.toString() ? `?${utmParams.toString()}` : ''
		const originalUrl = `${BASE_INTERVIEW_URL}/job/${data.jobId}/company/${data.companyId}/${utmQuery}`

		// Verificar se já existe um short link para essa combinação
		const existingLinks = (await infra.shortLinkRepository.listShortLinks({
			filters: [
				{ field: 'jobId', operator: '==', value: data.jobId },
				{ field: 'companyId', operator: '==', value: data.companyId },
			],
		})) as ShortLink[]

		// Se já existe, retornar o existente
		if (existingLinks.length > 0) {
			const existingLink = existingLinks[0]
			return `${SHORT_URL_BASE}/${existingLink.code}`
		}

		// Criar novo short link
		const shortLinkData: Omit<ShortLink, 'id'> = {
			code,
			originalUrl,
			jobId: data.jobId,
			companyId: data.companyId,
			createdAt: new Date(),
			clickCount: 0,
		}

		try {
			await infra.shortLinkRepository.createShortLink(code, shortLinkData)
			return `${SHORT_URL_BASE}/${code}`
		} catch {
			return originalUrl
		}
	}

	/**
	 * Resolve uma URL encurtada para os dados originais
	 */
	async function resolveShortLink(
		code: string,
	): Promise<ShortLinkData | null> {
		try {
			const shortLink = (await infra.shortLinkRepository.getShortLink(code)) as ShortLink | null

			if (!shortLink) {
				return null
			}

			// Incrementar contador de cliques
			await infra.shortLinkRepository.updateShortLink(code, {
				clickCount: (shortLink.clickCount || 0) + 1,
				lastClickedAt: new Date(),
			})

			return {
				jobId: shortLink.jobId ?? '',
				companyId: shortLink.companyId ?? '',
				utmSource: 'coploy',
				utmMedium: 'share_short_link',
				utmCampaign: shortLink.companyId ?? undefined,
				utmContent: shortLink.jobId ?? undefined,
			}
		} catch {
			return null
		}
	}

	return { createShortLink, resolveShortLink }
}

