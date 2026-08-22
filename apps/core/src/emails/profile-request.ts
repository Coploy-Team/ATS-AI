import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'
import { emailTheme } from './theme'

export type ProfileRequestEmailParams = {
	candidateName?: string | null
	companyName?: string | null
	jobName?: string | null
	/** Área do candidato — onde ele preenche clicando. */
	profileUrl: string
	/** Recado do recrutador, antes do botão. */
	message?: string | null
	language?: string | null
	/** Campos que faltam, em linguagem de gente (já traduzidos). */
	missing?: string[]
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const profileRequestPreviewData: ProfileRequestEmailParams = {
	candidateName: 'Ana Silva',
	companyName: 'Coploy',
	jobName: 'Engenheira de Software',
	profileUrl: 'https://candidato.coploy.io/perfil',
	missing: ['Experiências', 'Formação'],
	language: 'pt-BR',
}

type Copy = {
	greeting: (name?: string) => string
	body: (company: string, job?: string) => string
	missingIntro: string
	/**
	 * As DUAS portas.
	 *
	 * Formulário longo é onde o candidato desiste — por isso o assistente vem
	 * primeiro para quem prefere conversar, e o formulário fica para quem
	 * prefere clicar. A mesma régua que vale no chat vale aqui.
	 */
	chatTitle: string
	chatBody: string
	formTitle: string
	formBody: string
	cta: string
	subject: (company: string) => string
	preview: (company: string) => string
	footer: string
}

const COPY: Record<'pt' | 'en', Copy> = {
	pt: {
		greeting: (name) => (name ? `Olá, ${name}!` : 'Olá!'),
		body: (company, job) =>
			job
				? `A ${company} está avaliando você para a vaga de ${job} e o seu perfil na Coploy ainda está incompleto.`
				: `A ${company} está avaliando o seu perfil na Coploy, e ele ainda está incompleto.`,
		missingIntro: 'O que falta:',
		chatTitle: 'Pelo ChatGPT ou Claude',
		chatBody:
			'Conecte a Coploy no seu assistente e conte a sua trajetória numa mensagem — ou cole o texto do seu currículo. Ele organiza tudo sozinho.',
		formTitle: 'Pela sua área na Coploy',
		formBody: 'Prefere preencher clicando? A área do candidato tem os campos separados por seção.',
		cta: 'Completar meu perfil',
		subject: (company) => `${company} pediu para você completar seu perfil`,
		preview: (company) => `Seu perfil está incompleto para a ${company}`,
		footer: 'Você recebeu este e-mail porque participa de um processo seletivo na Coploy.',
	},
	en: {
		greeting: (name) => (name ? `Hi, ${name}!` : 'Hi!'),
		body: (company, job) =>
			job
				? `${company} is reviewing you for the ${job} role and your Coploy profile is still incomplete.`
				: `${company} is reviewing your Coploy profile, and it is still incomplete.`,
		missingIntro: "What's missing:",
		chatTitle: 'With ChatGPT or Claude',
		chatBody:
			'Connect Coploy to your assistant and tell your story in one message — or paste your résumé text. It structures everything for you.',
		formTitle: 'In your Coploy area',
		formBody: 'Prefer to fill it in? The candidate area has the fields split by section.',
		cta: 'Complete my profile',
		subject: (company) => `${company} asked you to complete your profile`,
		preview: (company) => `Your profile is incomplete for ${company}`,
		footer: 'You received this email because you take part in a hiring process on Coploy.',
	},
}

function pickCopy(language?: string | null): Copy {
	return (language ?? 'pt').toLowerCase().startsWith('en') ? COPY.en : COPY.pt
}

/**
 * Pedido de cadastro de perfil.
 *
 * O recrutador abre o candidato e encontra as colunas de trajetória vazias —
 * hoje isso é um beco: ele vê o buraco e não tem o que fazer. Este e-mail é a
 * saída, e ele oferece os DOIS caminhos porque as pessoas são diferentes: quem
 * prefere conversar usa o assistente, quem prefere clicar usa a área do
 * candidato.
 */
export function renderProfileRequestEmail(params: ProfileRequestEmailParams): RenderedEmail {
	const copy = pickCopy(params.language)
	const company = params.companyName?.trim() || 'Coploy'
	const job = params.jobName?.trim() || undefined
	const missing = (params.missing ?? []).filter(Boolean)

	const missingHtml =
		missing.length > 0
			? `<p style="Margin:0 0 6px 0;font-family:${emailTheme.fontFamily};font-size:14px;color:${emailTheme.colors.mutedText};">${escapeHtml(
					copy.missingIntro,
				)}</p>
			   <ul style="Margin:0 0 18px 0;padding-left:20px;font-family:${emailTheme.fontFamily};font-size:15px;line-height:24px;color:${emailTheme.colors.text};">
			     ${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
			   </ul>`
			: ''

	const path = (title: string, body: string) =>
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="Margin:0 0 12px 0;border-collapse:separate;">
		   <tr>
		     <td style="padding:14px 16px;border:1px solid ${emailTheme.colors.border};">
		       <p style="Margin:0 0 4px 0;font-family:${emailTheme.fontFamily};font-size:15px;font-weight:bold;color:${emailTheme.colors.text};">${escapeHtml(title)}</p>
		       <p style="Margin:0;font-family:${emailTheme.fontFamily};font-size:14px;line-height:21px;color:${emailTheme.colors.mutedText};">${escapeHtml(body)}</p>
		     </td>
		   </tr>
		 </table>`

	const subject = copy.subject(company)
	const bodyHtml = `
		<p style="Margin:0 0 16px 0;font-family:${emailTheme.fontFamily};font-size:16px;line-height:24px;color:${emailTheme.colors.text};">${escapeHtml(copy.greeting(params.candidateName?.trim()))}</p>
		${renderParagraphs(copy.body(company, job))}
		${params.message?.trim() ? renderParagraphs(params.message.trim()) : ''}
		${missingHtml}
		${path(copy.chatTitle, copy.chatBody)}
		${path(copy.formTitle, copy.formBody)}
		<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="Margin:20px 0 0 0;border-collapse:collapse;">
			<tr>
				<td style="background-color:${emailTheme.colors.accent};">
					<a href="${escapeHtml(params.profileUrl)}" style="display:inline-block;padding:13px 26px;font-family:${emailTheme.fontFamily};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(copy.cta)}</a>
				</td>
			</tr>
		</table>
		<p style="Margin:18px 0 0 0;font-family:${emailTheme.fontFamily};font-size:13px;line-height:20px;color:${emailTheme.colors.mutedText};word-break:break-all;">${escapeHtml(params.profileUrl)}</p>
		<p style="Margin:14px 0 0 0;font-family:${emailTheme.fontFamily};font-size:14px;line-height:22px;color:${emailTheme.colors.mutedText};">${escapeHtml(copy.footer)}</p>`

	return {
		subject,
		htmlBody: renderEmailLayout({
			title: subject,
			previewText: copy.preview(company),
			bodyHtml,
			language: params.language ?? 'pt-BR',
		}),
		// link cru também no texto: cliente que bloqueia HTML precisa dele
		textBody: [
			copy.greeting(params.candidateName?.trim()),
			copy.body(company, job),
			params.message?.trim() ?? '',
			missing.length > 0 ? `${copy.missingIntro} ${missing.join(', ')}` : '',
			`${copy.chatTitle}: ${copy.chatBody}`,
			`${copy.formTitle}: ${copy.formBody}`,
			params.profileUrl,
			copy.footer,
		]
			.filter(Boolean)
			.join('\n\n'),
	}
}
