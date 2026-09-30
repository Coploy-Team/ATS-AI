import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'

export type SlaAlertEmailParams = {
	recruiterName?: string | null
	jobName?: string | null
	companyName?: string | null
	overdueCount: number
	activeCount: number
	ratioPercent: number
	gracePeriodHours: number
	language?: string | null
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const slaAlertPreviewData: SlaAlertEmailParams = {
	recruiterName: 'Marina',
	jobName: 'Engenheira de Software',
	companyName: 'Coploy',
	overdueCount: 4,
	activeCount: 10,
	ratioPercent: 40,
	gracePeriodHours: 48,
	language: 'pt-BR',
}

type SlaAlertCopy = {
	jobFallback: string
	greeting: (recruiterName?: string) => string
	body: (params: {
		jobName: string
		overdueCount: number
		activeCount: number
		ratioPercent: number
		gracePeriodHours: number
	}) => string
	subject: (jobName: string) => string
	preview: (jobName: string) => string
	footer: string
}

const emailCopyByLanguage: Record<string, SlaAlertCopy> = {
	'pt-BR': {
		jobFallback: 'vaga',
		greeting: (recruiterName) => (recruiterName ? `Olá, ${recruiterName}.` : 'Olá.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`A vaga ${jobName} ultrapassou o limiar de SLA anti-ghosting: ${overdueCount} de ${activeCount} candidaturas ativas (${ratioPercent}%) estão sem decisão além do prazo. Você tem ${gracePeriodHours}h de carência para regularizar antes que a vaga seja pausada automaticamente.`,
		subject: (jobName) => `Alerta de SLA: ${jobName} precisa de atenção`,
		preview: (jobName) => `A vaga ${jobName} ultrapassou o limiar de SLA anti-ghosting.`,
		footer: 'Este e-mail foi enviado pela Coploy.',
	},
	'pt-PT': {
		jobFallback: 'vaga',
		greeting: (recruiterName) => (recruiterName ? `Olá, ${recruiterName}.` : 'Olá.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`A vaga ${jobName} ultrapassou o limiar de SLA anti-ghosting: ${overdueCount} de ${activeCount} candidaturas ativas (${ratioPercent}%) estão sem decisão além do prazo. Tem ${gracePeriodHours}h de carência para regularizar antes que a vaga seja pausada automaticamente.`,
		subject: (jobName) => `Alerta de SLA: ${jobName} precisa de atenção`,
		preview: (jobName) => `A vaga ${jobName} ultrapassou o limiar de SLA anti-ghosting.`,
		footer: 'Este e-mail foi enviado pela Coploy.',
	},
	en: {
		jobFallback: 'role',
		greeting: (recruiterName) => (recruiterName ? `Hello, ${recruiterName}.` : 'Hello.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`The role ${jobName} exceeded the anti-ghosting SLA threshold: ${overdueCount} of ${activeCount} active applications (${ratioPercent}%) are past the decision deadline. You have ${gracePeriodHours}h to catch up before the job is paused automatically.`,
		subject: (jobName) => `SLA alert: ${jobName} needs attention`,
		preview: (jobName) => `The role ${jobName} exceeded the anti-ghosting SLA threshold.`,
		footer: 'This email was sent by Coploy.',
	},
	es: {
		jobFallback: 'vacante',
		greeting: (recruiterName) => (recruiterName ? `Hola, ${recruiterName}.` : 'Hola.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`La vacante ${jobName} superó el umbral de SLA anti-ghosting: ${overdueCount} de ${activeCount} candidaturas activas (${ratioPercent}%) están sin decisión fuera de plazo. Tienes ${gracePeriodHours}h de gracia para regularizar antes de que la vacante se pause automáticamente.`,
		subject: (jobName) => `Alerta de SLA: ${jobName} necesita atención`,
		preview: (jobName) => `La vacante ${jobName} superó el umbral de SLA anti-ghosting.`,
		footer: 'Este correo fue enviado por Coploy.',
	},
	fr: {
		jobFallback: 'poste',
		greeting: (recruiterName) => (recruiterName ? `Bonjour, ${recruiterName}.` : 'Bonjour.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`Le poste ${jobName} a dépassé le seuil SLA anti-ghosting : ${overdueCount} sur ${activeCount} candidatures actives (${ratioPercent}%) sont sans décision hors délai. Vous avez ${gracePeriodHours}h pour régulariser avant une pause automatique.`,
		subject: (jobName) => `Alerte SLA : ${jobName} nécessite votre attention`,
		preview: (jobName) => `Le poste ${jobName} a dépassé le seuil SLA anti-ghosting.`,
		footer: 'Cet e-mail a été envoyé par Coploy.',
	},
	it: {
		jobFallback: 'posizione',
		greeting: (recruiterName) => (recruiterName ? `Ciao, ${recruiterName}.` : 'Ciao.'),
		body: ({ jobName, overdueCount, activeCount, ratioPercent, gracePeriodHours }) =>
			`La posizione ${jobName} ha superato la soglia SLA anti-ghosting: ${overdueCount} di ${activeCount} candidature attive (${ratioPercent}%) sono senza decisione oltre il termine. Hai ${gracePeriodHours}h di grazia per regolarizzare prima della pausa automatica.`,
		subject: (jobName) => `Avviso SLA: ${jobName} richiede attenzione`,
		preview: (jobName) => `La posizione ${jobName} ha superato la soglia SLA anti-ghosting.`,
		footer: 'Questa email è stata inviata da Coploy.',
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

function getEmailCopy(language?: string | null): SlaAlertCopy {
	return emailCopyByLanguage[getEmailLanguage(language)]
}

export function renderSlaAlertEmail(params: SlaAlertEmailParams): RenderedEmail {
	const language = getEmailLanguage(params.language)
	const copy = getEmailCopy(params.language)
	const jobName = params.jobName?.trim() || copy.jobFallback
	const greeting = copy.greeting(params.recruiterName?.trim())
	const body = copy.body({
		jobName,
		overdueCount: params.overdueCount,
		activeCount: params.activeCount,
		ratioPercent: params.ratioPercent,
		gracePeriodHours: params.gracePeriodHours,
	})
	const subject = copy.subject(jobName)

	const bodyHtml = `
							<p style="Margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#161014;">${escapeHtml(greeting)}</p>
							${renderParagraphs(body)}
							<p style="Margin:18px 0 0 0;font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#5d555a;">${escapeHtml(copy.footer)}</p>`

	return {
		subject,
		htmlBody: renderEmailLayout({
			title: subject,
			previewText: copy.preview(jobName),
			bodyHtml,
			language,
		}),
		textBody: [greeting, body, copy.footer].join('\n\n'),
	}
}
