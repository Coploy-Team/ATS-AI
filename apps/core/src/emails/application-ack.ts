import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'

export type ApplicationAckEmailParams = {
	candidateName?: string | null
	jobName?: string | null
	companyName?: string | null
	language?: string | null
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const applicationAckPreviewData: ApplicationAckEmailParams = {
	candidateName: 'Ana Silva',
	jobName: 'Engenheira de Software',
	companyName: 'Coploy',
	language: 'pt-BR',
}

type AckEmailCopy = {
	jobFallback: string
	companyFallback: string
	greeting: (candidateName?: string) => string
	body: (jobName: string, companyName: string) => string
	subject: (jobName?: string, companyName?: string) => string
	preview: (jobName: string, companyName: string) => string
	footer: string
}

const emailCopyByLanguage: Record<string, AckEmailCopy> = {
	'pt-BR': {
		jobFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Olá, ${candidateName}.` : 'Olá.'),
		body: (jobName, companyName) =>
			`Recebemos sua candidatura para ${jobName} na ${companyName}. Em breve a equipe de recrutamento dará o próximo passo no processo.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Recebemos sua candidatura para ${jobName} na ${companyName}`
			if (jobName) return `Recebemos sua candidatura para ${jobName}`
			if (companyName) return `Recebemos sua candidatura na ${companyName}`
			return 'Recebemos sua candidatura'
		},
		preview: (jobName, companyName) => `Recebemos sua candidatura para ${jobName} na ${companyName}.`,
		footer: 'Este e-mail foi enviado pela Coploy em nome da equipe de recrutamento.',
	},
	'pt-PT': {
		jobFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Olá, ${candidateName}.` : 'Olá.'),
		body: (jobName, companyName) =>
			`Recebemos a sua candidatura para ${jobName} na ${companyName}. Em breve a equipa de recrutamento dará o próximo passo no processo.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Recebemos a sua candidatura para ${jobName} na ${companyName}`
			if (jobName) return `Recebemos a sua candidatura para ${jobName}`
			if (companyName) return `Recebemos a sua candidatura na ${companyName}`
			return 'Recebemos a sua candidatura'
		},
		preview: (jobName, companyName) => `Recebemos a sua candidatura para ${jobName} na ${companyName}.`,
		footer: 'Este e-mail foi enviado pela Coploy em nome da equipa de recrutamento.',
	},
	en: {
		jobFallback: 'role',
		companyFallback: 'company',
		greeting: (candidateName) => (candidateName ? `Hello, ${candidateName}.` : 'Hello.'),
		body: (jobName, companyName) =>
			`We received your application for ${jobName} at ${companyName}. The recruiting team will share the next step soon.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `We received your application for ${jobName} at ${companyName}`
			if (jobName) return `We received your application for ${jobName}`
			if (companyName) return `We received your application at ${companyName}`
			return 'We received your application'
		},
		preview: (jobName, companyName) => `We received your application for ${jobName} at ${companyName}.`,
		footer: 'This email was sent by Coploy on behalf of the recruiting team.',
	},
	es: {
		jobFallback: 'vacante',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Hola, ${candidateName}.` : 'Hola.'),
		body: (jobName, companyName) =>
			`Recibimos tu candidatura para ${jobName} en ${companyName}. Pronto el equipo de reclutamiento compartirá el próximo paso.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Recibimos tu candidatura para ${jobName} en ${companyName}`
			if (jobName) return `Recibimos tu candidatura para ${jobName}`
			if (companyName) return `Recibimos tu candidatura en ${companyName}`
			return 'Recibimos tu candidatura'
		},
		preview: (jobName, companyName) => `Recibimos tu candidatura para ${jobName} en ${companyName}.`,
		footer: 'Este correo fue enviado por Coploy en nombre del equipo de reclutamiento.',
	},
	fr: {
		jobFallback: 'poste',
		companyFallback: 'entreprise',
		greeting: (candidateName) => (candidateName ? `Bonjour, ${candidateName}.` : 'Bonjour.'),
		body: (jobName, companyName) =>
			`Nous avons bien reçu votre candidature pour ${jobName} chez ${companyName}. L'équipe de recrutement partagera bientôt la prochaine étape.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Nous avons reçu votre candidature pour ${jobName} chez ${companyName}`
			if (jobName) return `Nous avons reçu votre candidature pour ${jobName}`
			if (companyName) return `Nous avons reçu votre candidature chez ${companyName}`
			return 'Nous avons reçu votre candidature'
		},
		preview: (jobName, companyName) => `Nous avons reçu votre candidature pour ${jobName} chez ${companyName}.`,
		footer: "Cet e-mail a été envoyé par Coploy au nom de l'équipe de recrutement.",
	},
	it: {
		jobFallback: 'posizione',
		companyFallback: 'azienda',
		greeting: (candidateName) => (candidateName ? `Ciao, ${candidateName}.` : 'Ciao.'),
		body: (jobName, companyName) =>
			`Abbiamo ricevuto la tua candidatura per ${jobName} presso ${companyName}. Il team di recruiting condividerà a breve il prossimo passo.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Abbiamo ricevuto la tua candidatura per ${jobName} presso ${companyName}`
			if (jobName) return `Abbiamo ricevuto la tua candidatura per ${jobName}`
			if (companyName) return `Abbiamo ricevuto la tua candidatura presso ${companyName}`
			return 'Abbiamo ricevuto la tua candidatura'
		},
		preview: (jobName, companyName) => `Abbiamo ricevuto la tua candidatura per ${jobName} presso ${companyName}.`,
		footer: 'Questa email è stata inviata da Coploy per conto del team di recruiting.',
	},
}

function getEmailLanguage(language?: string | null): string {
	const normalized = language?.trim()
	if (!normalized) return 'pt-BR'
	if (normalized in emailCopyByLanguage) return normalized
	if (normalized.toLowerCase().startsWith('pt')) return 'pt-BR'
	const baseLanguage = normalized.split('-')[0]
	return baseLanguage in emailCopyByLanguage ? baseLanguage : 'pt-BR'
}

function getEmailCopy(language?: string | null): AckEmailCopy {
	return emailCopyByLanguage[getEmailLanguage(language)]
}

export function renderApplicationAckEmail(params: ApplicationAckEmailParams): RenderedEmail {
	const language = getEmailLanguage(params.language)
	const copy = getEmailCopy(params.language)
	const jobName = params.jobName?.trim() || copy.jobFallback
	const companyName = params.companyName?.trim() || copy.companyFallback
	const candidateName = params.candidateName?.trim()
	const greeting = copy.greeting(candidateName)
	const body = copy.body(jobName, companyName)
	const subject = copy.subject(params.jobName?.trim(), params.companyName?.trim())

	const bodyHtml = `
							<p style="Margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#161014;">${escapeHtml(greeting)}</p>
							${renderParagraphs(body)}
							<p style="Margin:18px 0 0 0;font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#5d555a;">${escapeHtml(copy.footer)}</p>`

	return {
		subject,
		htmlBody: renderEmailLayout({
			title: subject,
			previewText: copy.preview(jobName, companyName),
			bodyHtml,
			language,
		}),
		textBody: [greeting, body, copy.footer].join('\n\n'),
	}
}
