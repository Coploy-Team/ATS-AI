import { emailTheme } from './theme'

/**
 * Marca do e-mail que o CANDIDATO recebe (decisão 4 do ADR-009).
 *
 * Quem fala com o candidato é a EMPRESA que abriu a vaga, não a Coploy — a
 * plataforma é infraestrutura, e no open ela nem é nossa. Então logo, cor e
 * nome vêm do portal de vagas que a empresa já configurou; a Coploy vira
 * assinatura discreta no rodapé.
 *
 * `null` = sem marca resolvida → o layout cai no tema Coploy de sempre. É o
 * caso dos e-mails que REALMENTE são nossos (redefinição de senha do ATS,
 * convite de colaborador, alerta de SLA pro recrutador).
 */
export interface EmailBranding {
	companyName: string
	logoUrl: string | null
	/** Cor de destaque (botões/filete). Hex do portal ou o accent padrão. */
	accentColor: string
	/** Texto sobre a cor de destaque — calculado pra ficar legível. */
	accentTextColor: string
	/** Assinatura discreta: false esconde o "powered by". */
	showPoweredBy: boolean
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

function normalizeHex(value: string | null | undefined): string | null {
	const raw = value?.trim()
	if (!raw || !HEX.test(raw)) return null
	const hex = raw.startsWith('#') ? raw.slice(1) : raw
	const full =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex
	return `#${full.toLowerCase()}`
}

/**
 * Preto ou branco sobre a cor da marca, pelo que se lê melhor.
 *
 * Sem isso, uma marca clara (o lime da Coploy é o exemplo em casa) ganharia
 * texto branco sobre fundo quase branco — botão ilegível no e-mail de um
 * candidato que talvez só tenha aquela chance de clicar.
 */
export function readableTextOn(hexColor: string): string {
	const hex = normalizeHex(hexColor) ?? emailTheme.colors.accent
	const r = Number.parseInt(hex.slice(1, 3), 16) / 255
	const g = Number.parseInt(hex.slice(3, 5), 16) / 255
	const b = Number.parseInt(hex.slice(5, 7), 16) / 255
	const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
	const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
	// contraste contra branco vs contra preto — vence quem for maior
	return (1.05) / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#161014'
}

export function buildEmailBranding(input: {
	companyName?: string | null
	logoUrl?: string | null
	primaryColor?: string | null
}): EmailBranding | null {
	const companyName = input.companyName?.trim()
	if (!companyName) return null
	const accentColor = normalizeHex(input.primaryColor) ?? emailTheme.colors.accent
	return {
		companyName,
		logoUrl: input.logoUrl?.trim() || null,
		accentColor,
		accentTextColor: readableTextOn(accentColor),
		showPoweredBy: true,
	}
}

/** Cor de destaque efetiva (marca da empresa ou o accent Coploy). */
export function accentOf(branding: EmailBranding | null | undefined): string {
	return branding?.accentColor ?? emailTheme.colors.accent
}

/** Cor do texto sobre o destaque. */
export function accentTextOf(branding: EmailBranding | null | undefined): string {
	return branding?.accentTextColor ?? '#ffffff'
}
