import { z } from 'zod'

/*
 * Campos de branding são todos opcionais NA PRÁTICA: o fluxo SaaS antigo
 * preenchia tudo na criação (domínio, banner, logo), mas o upsert de branding
 * (distribuição open) cria o portal vazio e preenche aos poucos. O schema
 * exigia string em tudo e a validação de RESPOSTA derrubava o GET com 400
 * no primeiro portal que tivesse um null.
 */
export const JobPortalSchema = z.object({
	id: z.string(),
	bannerUrl: z.string().nullish(),
	bannerPosition: z.number().nullish(),
	company: z.string(),
	defaultDomainUrl: z.string().nullish(),
	isProfileVisible: z.boolean().nullish(),
	logoUrl: z.string().nullish(),
	primaryColor: z.string().nullish(),
	textColor: z.string().nullish(),
	socialLinks: z
		.object({
			website: z.string().nullish(),
			linkedin: z.string().nullish(),
			instagram: z.string().nullish(),
			facebook: z.string().nullish(),
			glassdoor: z.string().nullish(),
		})
		.nullish(),
	/** "Sobre a empresa" em Markdown — home do portal e fecho da página da vaga. */
	about: z.string().nullish(),
	/** Vídeo institucional (URL YouTube/Vimeo). */
	videoUrl: z.string().nullish(),
})

export type JobPortal = z.infer<typeof JobPortalSchema>
