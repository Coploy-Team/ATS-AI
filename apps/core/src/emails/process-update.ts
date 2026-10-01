import { accentOf, accentTextOf, type EmailBranding } from './branding'
import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'
import { emailTheme } from './theme'

/**
 * E-mails do OTS 0.3 para o candidato: a proposta de horário e o retorno do
 * processo. Os dois levam para a área do candidato, onde ele responde — ou
 * responde pelo assistente conectado, que lê a mesma proposta.
 */

export type RenderedEmail = { subject: string; htmlBody: string; textBody: string }

type Lang = 'pt' | 'en'
const langOf = (language?: string | null): Lang => ((language ?? 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt')

const FORMAT_LABEL: Record<Lang, Record<string, string>> = {
	pt: { video_call: 'Chamada de vídeo', phone: 'Telefone', onsite: 'Presencial' },
	en: { video_call: 'Video call', phone: 'Phone', onsite: 'On site' },
}

/** "qua., 2 de out., 14:00" no fuso da proposta — é o que a pessoa lê no relógio dela. */
export function formatSlot(start: string, timezone: string, language?: string | null): string {
	const locale = langOf(language) === 'en' ? 'en-US' : 'pt-BR'
	try {
		return new Intl.DateTimeFormat(locale, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: timezone,
		}).format(new Date(start))
	} catch {
		return new Date(start).toISOString()
	}
}

const paragraph = (text: string, muted = false) =>
	`<p style="Margin:0 0 14px 0;font-family:${emailTheme.fontFamily};font-size:${muted ? 14 : 16}px;line-height:24px;color:${
		muted ? emailTheme.colors.mutedText : emailTheme.colors.text
	};">${escapeHtml(text)}</p>`

const button = (label: string, url: string, branding?: EmailBranding | null) => `
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="Margin:20px 0 0 0;border-collapse:collapse;">
		<tr><td style="background-color:${accentOf(branding)};">
			<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-family:${emailTheme.fontFamily};font-size:15px;font-weight:bold;color:${accentTextOf(branding)};text-decoration:none;">${escapeHtml(label)}</a>
		</td></tr>
	</table>`

const box = (lines: string[]) => `
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="Margin:4px 0 16px 0;border-collapse:separate;">
		<tr><td style="padding:14px 16px;border:1px solid ${emailTheme.colors.border};">
			${lines.map((line) => `<p style="Margin:0 0 4px 0;font-family:${emailTheme.fontFamily};font-size:15px;line-height:22px;color:${emailTheme.colors.text};">${escapeHtml(line)}</p>`).join('')}
		</td></tr>
	</table>`

export type ScheduleProposalEmailParams = {
	branding?: EmailBranding | null
	candidateName?: string | null
	companyName?: string | null
	jobName?: string | null
	format: string
	durationMinutes: number
	timezone: string
	slots: Array<{ start: string; end: string }>
	note?: string | null
	/** Onde ele escolhe. Sem área do candidato (instalação open), o e-mail pede resposta ao recrutador. */
	respondUrl?: string | null
	language?: string | null
	/** Nova proposta substituindo uma anterior. */
	replacesPrevious?: boolean
}

const PROPOSAL_COPY = {
	pt: {
		greeting: (name?: string) => (name ? `Olá, ${name}!` : 'Olá!'),
		body: (company: string, job?: string) =>
			job ? `A ${company} quer conversar com você sobre a vaga de ${job}. Escolha o horário que funciona melhor.` : `A ${company} quer conversar com você. Escolha o horário que funciona melhor.`,
		replaced: 'Esta proposta substitui a anterior.',
		details: (format: string, minutes: number, timezone: string) => `${format} · ${minutes} min · horários em ${timezone}`,
		cta: 'Escolher horário',
		assistant: 'Conectou a Coploy no ChatGPT ou no Claude? Dá para responder por lá também.',
		noArea: 'Responda a este processo pelo canal que a empresa combinou com você.',
		subject: (company: string) => `${company} propôs horários para uma entrevista`,
		footer: (brand: string) => `Você recebeu este e-mail porque participa de um processo seletivo em ${brand}.`,
	},
	en: {
		greeting: (name?: string) => (name ? `Hi, ${name}!` : 'Hi!'),
		body: (company: string, job?: string) =>
			job ? `${company} would like to talk with you about the ${job} role. Pick the time that works best.` : `${company} would like to talk with you. Pick the time that works best.`,
		replaced: 'This proposal replaces the previous one.',
		details: (format: string, minutes: number, timezone: string) => `${format} · ${minutes} min · times in ${timezone}`,
		cta: 'Pick a time',
		assistant: 'Connected Coploy to ChatGPT or Claude? You can answer there too.',
		noArea: 'Reply through the channel the company agreed with you.',
		subject: (company: string) => `${company} proposed times for an interview`,
		footer: (brand: string) => `You received this email because you take part in a hiring process at ${brand}.`,
	},
}

export function renderScheduleProposalEmail(params: ScheduleProposalEmailParams): RenderedEmail {
	const lang = langOf(params.language)
	const copy = PROPOSAL_COPY[lang]
	const company = params.companyName?.trim() || 'Coploy'
	const job = params.jobName?.trim() || undefined
	const format = FORMAT_LABEL[lang][params.format] ?? params.format
	const slots = params.slots.map((slot) => formatSlot(slot.start, params.timezone, params.language))
	const subject = copy.subject(company)
	const brand = params.branding?.companyName ?? 'Coploy'

	const bodyHtml = [
		paragraph(copy.greeting(params.candidateName?.trim())),
		paragraph(copy.body(company, job)),
		params.replacesPrevious ? paragraph(copy.replaced, true) : '',
		params.note?.trim() ? renderParagraphs(params.note.trim()) : '',
		paragraph(copy.details(format, params.durationMinutes, params.timezone), true),
		box(slots),
		params.respondUrl ? button(copy.cta, params.respondUrl, params.branding) : paragraph(copy.noArea, true),
		params.respondUrl ? paragraph(copy.assistant, true) : '',
		paragraph(copy.footer(brand), true),
	].join('')

	return {
		subject,
		htmlBody: renderEmailLayout({ title: subject, previewText: copy.body(company, job), bodyHtml, language: params.language ?? 'pt-BR', branding: params.branding ?? null }),
		textBody: [
			copy.greeting(params.candidateName?.trim()),
			copy.body(company, job),
			params.replacesPrevious ? copy.replaced : '',
			params.note?.trim() ?? '',
			copy.details(format, params.durationMinutes, params.timezone),
			slots.map((slot) => `- ${slot}`).join('\n'),
			params.respondUrl ? `${copy.cta}: ${params.respondUrl}` : copy.noArea,
			copy.footer(brand),
		].filter(Boolean).join('\n\n'),
	}
}

export type ProcessFeedbackEmailParams = {
	branding?: EmailBranding | null
	candidateName?: string | null
	companyName?: string | null
	jobName?: string | null
	message: string
	nextStep?: string | null
	viewUrl?: string | null
	language?: string | null
}

const FEEDBACK_COPY = {
	pt: {
		greeting: (name?: string) => (name ? `Olá, ${name}!` : 'Olá!'),
		intro: (company: string, job?: string) => (job ? `Tem novidade da ${company} sobre a vaga de ${job}:` : `Tem novidade da ${company} sobre o seu processo:`),
		next: 'Próximo passo',
		cta: 'Ver meu processo',
		subject: (company: string) => `Novidade da ${company} sobre o seu processo`,
		footer: (brand: string) => `Você recebeu este e-mail porque participa de um processo seletivo em ${brand}.`,
	},
	en: {
		greeting: (name?: string) => (name ? `Hi, ${name}!` : 'Hi!'),
		intro: (company: string, job?: string) => (job ? `An update from ${company} about the ${job} role:` : `An update from ${company} about your process:`),
		next: 'Next step',
		cta: 'See my process',
		subject: (company: string) => `An update from ${company} about your process`,
		footer: (brand: string) => `You received this email because you take part in a hiring process at ${brand}.`,
	},
}

export function renderProcessFeedbackEmail(params: ProcessFeedbackEmailParams): RenderedEmail {
	const copy = FEEDBACK_COPY[langOf(params.language)]
	const company = params.companyName?.trim() || 'Coploy'
	const job = params.jobName?.trim() || undefined
	const subject = copy.subject(company)
	const brand = params.branding?.companyName ?? 'Coploy'
	const bodyHtml = [
		paragraph(copy.greeting(params.candidateName?.trim())),
		paragraph(copy.intro(company, job)),
		renderParagraphs(params.message.trim()),
		params.nextStep?.trim() ? box([`${copy.next}: ${params.nextStep.trim()}`]) : '',
		params.viewUrl ? button(copy.cta, params.viewUrl, params.branding) : '',
		paragraph(copy.footer(brand), true),
	].join('')
	return {
		subject,
		htmlBody: renderEmailLayout({ title: subject, previewText: copy.intro(company, job), bodyHtml, language: params.language ?? 'pt-BR', branding: params.branding ?? null }),
		textBody: [
			copy.greeting(params.candidateName?.trim()),
			copy.intro(company, job),
			params.message.trim(),
			params.nextStep?.trim() ? `${copy.next}: ${params.nextStep.trim()}` : '',
			params.viewUrl ?? '',
			copy.footer(brand),
		].filter(Boolean).join('\n\n'),
	}
}
