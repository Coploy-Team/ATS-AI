import { accentOf, type EmailBranding } from './branding'
import { emailTheme } from './theme'

export type EmailLayoutParams = {
	previewText: string
	title: string
	bodyHtml: string
	language?: string
	/**
	 * Marca da EMPRESA quando o destinatário é candidato (decisão 4 do
	 * ADR-009). Ausente = e-mail nosso mesmo (senha do ATS, convite de
	 * colaborador) e o layout segue com a marca Coploy.
	 */
	branding?: EmailBranding | null
	/** Rodapé por idioma — quem envia sabe a língua do destinatário. */
	footerNote?: string | null
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

export function renderParagraphs(value: string): string {
	return value
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map((paragraph) => {
			const withBreaks = paragraph
				.split(/\n/)
				.map((line) => escapeHtml(line))
				.join('<br>')

			return `<p style="Margin:0 0 16px 0;font-family:${emailTheme.fontFamily};font-size:16px;line-height:24px;color:${emailTheme.colors.text};">${withBreaks}</p>`
		})
		.join('')
}

export function renderEmailLayout(params: EmailLayoutParams): string {
	const { previewText, title, bodyHtml, language = 'pt-BR', branding = null } = params
	const accent = accentOf(branding)
	const brandName = branding?.companyName ?? emailTheme.brandName
	const logoUrl = branding ? branding.logoUrl : emailTheme.logoUrl
	const footerNote =
		params.footerNote ??
		(branding
			? null
			: `Precisa falar com a gente? Escreva para <a href="mailto:${escapeHtml(emailTheme.supportEmail)}" style="color:${emailTheme.colors.footerText};text-decoration:underline;">${escapeHtml(emailTheme.supportEmail)}</a>.`)

	/*
	 * Empresa sem logo não fica com buraco: o NOME dela ocupa o cabeçalho.
	 * Marca ausente por completo = e-mail da Coploy, com o logo de sempre.
	 */
	const headerHtml = logoUrl
		? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" width="136" style="display:block;border:0;outline:none;text-decoration:none;max-width:136px;height:auto;">`
		: `<p style="Margin:0;font-family:${emailTheme.fontFamily};font-size:19px;line-height:26px;font-weight:bold;color:${emailTheme.colors.text};">${escapeHtml(brandName)}</p>`

	return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="light">
	<title>${escapeHtml(title)}</title>
</head>
<body style="Margin:0;padding:0;background-color:${emailTheme.colors.background};">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${emailTheme.colors.background};border-collapse:collapse;">
		<tr>
			<td align="center" style="padding:28px 12px;">
				<table role="presentation" width="${emailTheme.maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${emailTheme.maxWidth}px;background-color:${emailTheme.colors.surface};border-collapse:collapse;border:1px solid ${emailTheme.colors.border};">
					<tr>
						<td style="padding:26px 30px 18px 30px;border-bottom:4px solid ${accent};background-color:${emailTheme.colors.surface};">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
								<tr>
									<td>
										${headerHtml}
									</td>
								</tr>
							</table>
						</td>
					</tr>
					<tr>
						<td style="padding:30px;font-family:${emailTheme.fontFamily};color:${emailTheme.colors.text};background-color:${emailTheme.colors.surface};">
							<h1 style="Margin:0 0 18px 0;font-family:${emailTheme.fontFamily};font-size:22px;line-height:29px;font-weight:bold;color:${emailTheme.colors.text};">${escapeHtml(title)}</h1>
							${bodyHtml}
						</td>
					</tr>
					<tr>
						<td style="padding:24px 30px;background-color:${emailTheme.colors.footer};font-family:${emailTheme.fontFamily};">
							<p style="Margin:0 0 8px 0;font-size:14px;line-height:20px;color:${emailTheme.colors.footerText};">${escapeHtml(brandName)}</p>
							${footerNote ? `<p style="Margin:0;font-size:12px;line-height:18px;color:${emailTheme.colors.footerText};">${footerNote}</p>` : ''}
							${
								branding?.showPoweredBy
									? `<p style="Margin:10px 0 0 0;font-size:11px;line-height:16px;color:${emailTheme.colors.footerText};opacity:0.6;">powered by Coploy</p>`
									: ''
							}
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`
}
