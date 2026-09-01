import { accentOf, accentTextOf, type EmailBranding } from './branding'
import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'

export type RejectionFeedbackEmailParams = {
	/** Marca da empresa quando o destinatario e candidato . */
	branding?: EmailBranding | null
	candidateName?: string | null
	jobName?: string | null
	companyName?: string | null
	message: string
	reviewUrl?: string | null
	language?: string | null
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const rejectionFeedbackPreviewData: RejectionFeedbackEmailParams = {
	candidateName: 'Ana Silva',
	jobName: 'Engenheira de Software',
	companyName: 'Coploy',
	reviewUrl: 'https://interview.coploy.io/careers/company-123/jobs/job-456/applications/application-789/revisao',
	message:
		'Olá {{nomeCandidato}}, obrigado por participar do processo para a vaga {{nomeVaga}} na {{nomeDaEmpresa}}.\n\nNeste momento seguimos com outra pessoa candidata, mas valorizamos seu tempo e sua participação.',
}

type RejectionEmailCopy = {
	applicationFallback: string
	companyFallback: string
	greeting: (candidateName?: string) => string
	processReturn: (jobName: string, companyName: string) => string
	subject: (jobName?: string, companyName?: string) => string
	preview: (jobName: string, companyName: string) => string
	reviewDescription: string
	reviewCta: string
	footer: (brand: string) => string
}

const emailCopyByLanguage: Record<string, RejectionEmailCopy> = {
	'pt-BR': {
		applicationFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => candidateName ? `Olá, ${candidateName}.` : 'Olá.',
		processReturn: (jobName, companyName) => `Temos um retorno sobre seu processo seletivo para ${jobName} na ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Retorno sobre seu processo seletivo para ${jobName} na ${companyName}`
			if (jobName) return `Retorno sobre seu processo seletivo para ${jobName}`
			if (companyName) return `Retorno sobre seu processo seletivo na ${companyName}`
			return 'Retorno sobre seu processo seletivo'
		},
		preview: (jobName, companyName) => `Retorno sobre seu processo seletivo para ${jobName} na ${companyName}.`,
		reviewDescription: 'Se você discorda desta decisão, pode pedir que uma pessoa da empresa revise sua candidatura.',
		reviewCta: 'Pedir revisão humana',
		footer: (brand: string) => `Este e-mail foi enviado por ${brand} em nome da equipe de recrutamento.`,
	},
	'pt-PT': {
		applicationFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => candidateName ? `Olá, ${candidateName}.` : 'Olá.',
		processReturn: (jobName, companyName) => `Temos um retorno sobre o seu processo seletivo para ${jobName} na ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Retorno sobre o seu processo seletivo para ${jobName} na ${companyName}`
			if (jobName) return `Retorno sobre o seu processo seletivo para ${jobName}`
			if (companyName) return `Retorno sobre o seu processo seletivo na ${companyName}`
			return 'Retorno sobre o seu processo seletivo'
		},
		preview: (jobName, companyName) => `Retorno sobre o seu processo seletivo para ${jobName} na ${companyName}.`,
		reviewDescription: 'Se discorda desta decisão, pode pedir que uma pessoa da empresa reveja a sua candidatura.',
		reviewCta: 'Pedir revisão humana',
		footer: (brand: string) => `Este e-mail foi enviado por ${brand} em nome da equipa de recrutamento.`,
	},
	en: {
		applicationFallback: 'role',
		companyFallback: 'company',
		greeting: (candidateName) => candidateName ? `Hello, ${candidateName}.` : 'Hello.',
		processReturn: (jobName, companyName) => `We have an update about your hiring process for ${jobName} at ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Update about your hiring process for ${jobName} at ${companyName}`
			if (jobName) return `Update about your hiring process for ${jobName}`
			if (companyName) return `Update about your hiring process at ${companyName}`
			return 'Update about your hiring process'
		},
		preview: (jobName, companyName) => `Update about your hiring process for ${jobName} at ${companyName}.`,
		reviewDescription: 'If you disagree with this decision, you can ask a person at the company to review your application.',
		reviewCta: 'Request human review',
		footer: (brand: string) => `This email was sent by ${brand} on behalf of the recruiting team.`,
	},
	es: {
		applicationFallback: 'vacante',
		companyFallback: 'empresa',
		greeting: (candidateName) => candidateName ? `Hola, ${candidateName}.` : 'Hola.',
		processReturn: (jobName, companyName) => `Tenemos una actualización sobre tu proceso de selección para ${jobName} en ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Actualización sobre tu proceso de selección para ${jobName} en ${companyName}`
			if (jobName) return `Actualización sobre tu proceso de selección para ${jobName}`
			if (companyName) return `Actualización sobre tu proceso de selección en ${companyName}`
			return 'Actualización sobre tu proceso de selección'
		},
		preview: (jobName, companyName) => `Actualización sobre tu proceso de selección para ${jobName} en ${companyName}.`,
		reviewDescription: 'Si no estás de acuerdo con esta decisión, puedes pedir que una persona de la empresa revise tu candidatura.',
		reviewCta: 'Solicitar revisión humana',
		footer: (brand: string) => `Este correo fue enviado por ${brand} en nombre del equipo de reclutamiento.`,
	},
	fr: {
		applicationFallback: 'poste',
		companyFallback: 'entreprise',
		greeting: (candidateName) => candidateName ? `Bonjour, ${candidateName}.` : 'Bonjour.',
		processReturn: (jobName, companyName) => `Nous avons une mise à jour concernant votre processus de recrutement pour ${jobName} chez ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Mise à jour concernant votre processus de recrutement pour ${jobName} chez ${companyName}`
			if (jobName) return `Mise à jour concernant votre processus de recrutement pour ${jobName}`
			if (companyName) return `Mise à jour concernant votre processus de recrutement chez ${companyName}`
			return 'Mise à jour concernant votre processus de recrutement'
		},
		preview: (jobName, companyName) => `Mise à jour concernant votre processus de recrutement pour ${jobName} chez ${companyName}.`,
		reviewDescription: "Si vous contestez cette décision, vous pouvez demander à une personne de l'entreprise de revoir votre candidature.",
		reviewCta: 'Demander une révision humaine',
		footer: (brand: string) => `Cet e-mail a été envoyé par ${brand} au nom de l'équipe de recrutement.`,
	},
	it: {
		applicationFallback: 'posizione',
		companyFallback: 'azienda',
		greeting: (candidateName) => candidateName ? `Ciao, ${candidateName}.` : 'Ciao.',
		processReturn: (jobName, companyName) => `Abbiamo un aggiornamento sul tuo processo di selezione per ${jobName} presso ${companyName}.`,
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Aggiornamento sul tuo processo di selezione per ${jobName} presso ${companyName}`
			if (jobName) return `Aggiornamento sul tuo processo di selezione per ${jobName}`
			if (companyName) return `Aggiornamento sul tuo processo di selezione presso ${companyName}`
			return 'Aggiornamento sul tuo processo di selezione'
		},
		preview: (jobName, companyName) => `Aggiornamento sul tuo processo di selezione per ${jobName} presso ${companyName}.`,
		reviewDescription: "Se non sei d'accordo con questa decisione, puoi chiedere a una persona dell'azienda di rivedere la tua candidatura.",
		reviewCta: 'Richiedi revisione umana',
		footer: (brand: string) => `Questa email è stata inviata da ${brand} per conto del team di recruiting.`,
	},
}

function getEmailCopy(language?: string | null): RejectionEmailCopy {
	return emailCopyByLanguage[getEmailLanguage(language)]
}

function getEmailLanguage(language?: string | null): string {
	const normalized = language?.trim()
	if (!normalized) return 'pt-BR'
	if (normalized in emailCopyByLanguage) return normalized
	if (normalized.toLowerCase().startsWith('pt')) return 'pt-BR'
	const baseLanguage = normalized.split('-')[0]
	return baseLanguage in emailCopyByLanguage ? baseLanguage : 'pt-BR'
}

function replaceFeedbackPlaceholders(params: RejectionFeedbackEmailParams): string {
	return params.message
		.trim()
		.replace(/{{nomeCandidato}}/g, params.candidateName || '')
		.replace(/{{nomeVaga}}/g, params.jobName || '')
		.replace(/{{nomeDaEmpresa}}/g, params.companyName || '')
}

function buildSubject(params: RejectionFeedbackEmailParams): string {
	const jobName = params.jobName?.trim()
	const companyName = params.companyName?.trim()
	return getEmailCopy(params.language).subject(jobName, companyName)
}

export function renderRejectionFeedbackEmail(params: RejectionFeedbackEmailParams): RenderedEmail {
	const subject = buildSubject(params)
	const language = getEmailLanguage(params.language)
	const copy = getEmailCopy(params.language)
	const processedMessage = replaceFeedbackPlaceholders(params)
	const jobName = params.jobName?.trim() || copy.applicationFallback
	const companyName = params.companyName?.trim() || copy.companyFallback
	const candidateName = params.candidateName?.trim()
	const reviewUrl = params.reviewUrl?.trim()

	const intro = copy.greeting(candidateName)
	const processReturn = copy.processReturn(jobName, companyName)
	const reviewHtml = reviewUrl
		? `
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="Margin:22px 0;border-collapse:collapse;background-color:#f7faf4;border:1px solid #dde5d7;">
								<tr>
									<td style="padding:18px 20px;font-family:Arial, Helvetica, sans-serif;color:#161014;">
										<p style="Margin:0 0 12px 0;font-size:15px;line-height:22px;color:#161014;">${escapeHtml(copy.reviewDescription)}</p>
										<a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background-color:#2f6b50;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:bold;padding:12px 16px;border-radius:6px;">${escapeHtml(copy.reviewCta)}</a>
									</td>
								</tr>
							</table>`
		: ''
	const bodyHtml = `
							<p style="Margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#161014;">${escapeHtml(intro)}</p>
							<p style="Margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#161014;">${escapeHtml(processReturn)}</p>
							${renderParagraphs(processedMessage)}
							${reviewHtml}
							<p style="Margin:18px 0 0 0;font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#5d555a;">${escapeHtml(copy.footer(params.branding?.companyName ?? 'Coploy'))}</p>`

	const textParts = [
		intro,
		processReturn,
		processedMessage,
	]

	if (reviewUrl) {
		textParts.push(
			copy.reviewDescription,
			`${copy.reviewCta}: ${reviewUrl}`,
		)
	}

	const textBody = [
		...textParts,
		copy.footer(params.branding?.companyName ?? 'Coploy'),
	].join('\n\n')

	return {
		subject,
		htmlBody: renderEmailLayout({
			title: subject,
			previewText: copy.preview(jobName, companyName),
			bodyHtml,
			language,
			branding: params.branding ?? null,
		}),
		textBody,
	}
}
