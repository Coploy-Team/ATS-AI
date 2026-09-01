import { escapeHtml, renderEmailLayout } from './layout'
import { emailTheme } from './theme'

export type PasswordResetEmailParams = {
	/** Nome de quem pediu, quando conhecido — o e-mail funciona sem ele. */
	name?: string | null
	/** Link que abre a tela de nova senha DENTRO do ATS. */
	resetUrl: string
	/** Quanto tempo o link vale, em horas (o Firebase usa 1h por padrão). */
	expiresInHours: number
	language?: string | null
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const passwordResetPreviewData: PasswordResetEmailParams = {
	name: 'Ana Silva',
	resetUrl: 'https://ats.coploy.io/redefinir-senha?oobCode=exemplo',
	expiresInHours: 1,
	language: 'pt-BR',
}

type Copy = {
	subject: string
	previewText: string
	title: string
	greeting: (name?: string | null) => string
	body: string
	cta: string
	expiry: (hours: number) => string
	/**
	 * A linha que evita o susto.
	 *
	 * Quem NÃO pediu a troca precisa saber, na mesma tela, que não há nada a
	 * fazer — senão a reação é trocar a senha por precaução, que é exatamente o
	 * trabalho que o e-mail deveria poupar.
	 */
	ignore: string
	fallback: string
}

const COPY: Record<'pt-BR' | 'en', Copy> = {
	'pt-BR': {
		subject: 'Redefinir sua senha na Coploy',
		previewText: 'Link para criar uma senha nova.',
		title: 'Redefinir senha',
		greeting: (name) => (name ? `Olá, ${name}.` : 'Olá.'),
		body: 'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova.',
		cta: 'Criar nova senha',
		expiry: (hours) =>
			hours === 1
				? 'O link vale por 1 hora e só pode ser usado uma vez.'
				: `O link vale por ${hours} horas e só pode ser usado uma vez.`,
		ignore:
			'Se não foi você quem pediu, pode ignorar esta mensagem — sua senha continua a mesma.',
		fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
	},
	en: {
		subject: 'Reset your Coploy password',
		previewText: 'Link to create a new password.',
		title: 'Reset password',
		greeting: (name) => (name ? `Hi, ${name}.` : 'Hi.'),
		body: 'We received a request to reset your account password. Click the button below to create a new one.',
		cta: 'Create new password',
		expiry: (hours) =>
			hours === 1
				? 'The link is valid for 1 hour and can only be used once.'
				: `The link is valid for ${hours} hours and can only be used once.`,
		ignore: "If you didn't request this, you can ignore this message — your password stays the same.",
		fallback: "If the button doesn't work, copy and paste this address into your browser:",
	},
}

function pickCopy(language?: string | null): Copy {
	return String(language ?? '').toLowerCase().startsWith('en') ? COPY.en : COPY['pt-BR']
}

/**
 * E-mail de redefinição de senha.
 *
 * O link é gerado pelo Firebase (token de uso único, com expiração) mas a
 * ENTREGA é nossa, pelo Postmark, e ele aponta para uma tela do ATS. O
 * candidato nunca vê a página hospedada do Firebase, que não tem nossa marca
 * nem nosso idioma.
 */
export function renderPasswordResetEmail(params: PasswordResetEmailParams): RenderedEmail {
	const copy = pickCopy(params.language)
	const url = escapeHtml(params.resetUrl)

	const bodyHtml = `
		<p style="Margin:0 0 16px 0;font-family:${emailTheme.fontFamily};font-size:16px;line-height:24px;color:${emailTheme.colors.text};">${escapeHtml(copy.greeting(params.name))}</p>
		<p style="Margin:0 0 22px 0;font-family:${emailTheme.fontFamily};font-size:15px;line-height:24px;color:${emailTheme.colors.text};">${escapeHtml(copy.body)}</p>
		<table role="presentation" cellpadding="0" cellspacing="0" style="Margin:0 0 22px 0;">
			<tr>
				<td style="background-color:${emailTheme.colors.accent};">
					<a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${emailTheme.fontFamily};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(copy.cta)}</a>
				</td>
			</tr>
		</table>
		<p style="Margin:0 0 8px 0;font-family:${emailTheme.fontFamily};font-size:14px;line-height:21px;color:${emailTheme.colors.mutedText};">${escapeHtml(copy.expiry(params.expiresInHours))}</p>
		<p style="Margin:0 0 22px 0;font-family:${emailTheme.fontFamily};font-size:14px;line-height:21px;color:${emailTheme.colors.mutedText};">${escapeHtml(copy.ignore)}</p>
		<p style="Margin:0 0 6px 0;font-family:${emailTheme.fontFamily};font-size:13px;color:${emailTheme.colors.mutedText};">${escapeHtml(copy.fallback)}</p>
		<p style="Margin:0;font-family:${emailTheme.fontFamily};font-size:13px;word-break:break-all;"><a href="${url}" style="color:${emailTheme.colors.accentDark};">${url}</a></p>
	`
	return {
		subject: copy.subject,
		htmlBody: renderEmailLayout({
			previewText: copy.previewText,
			title: copy.title,
			bodyHtml,
			language: params.language ?? 'pt-BR',
		}),
		textBody: [
			copy.greeting(params.name),
			'',
			copy.body,
			'',
			params.resetUrl,
			'',
			copy.expiry(params.expiresInHours),
			copy.ignore,
		].join('\n'),
	}
}
