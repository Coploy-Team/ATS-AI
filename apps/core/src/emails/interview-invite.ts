import { accentOf, accentTextOf, type EmailBranding } from './branding'
import { escapeHtml, renderEmailLayout, renderParagraphs } from './layout'
import { emailTheme } from './theme'

export type InterviewInviteEmailParams = {
	/** Marca da empresa quando o destinatario e candidato . */
	branding?: EmailBranding | null
	candidateName?: string | null
	jobName?: string | null
	companyName?: string | null
	interviewUrl: string
	/** Mensagem opcional do recrutador, exibida antes do botão. */
	message?: string | null
	language?: string | null
}

export type RenderedEmail = {
	subject: string
	htmlBody: string
	textBody: string
}

export const interviewInvitePreviewData: InterviewInviteEmailParams = {
	candidateName: 'Ana Silva',
	jobName: 'Engenheira de Software',
	companyName: 'Coploy',
	interviewUrl: 'https://interview.coploy.io/job/job-456/company/company-123/login',
	language: 'pt-BR',
}

type InviteEmailCopy = {
	jobFallback: string
	companyFallback: string
	greeting: (candidateName?: string) => string
	body: (jobName: string, companyName: string) => string
	howItWorks: string
	cta: string
	subject: (jobName?: string, companyName?: string) => string
	preview: (jobName: string, companyName: string) => string
	footer: (brand: string) => string
}

/**
 * O vocabulário é "entrevista", nunca "teste" ou "avaliação": a entrevista com
 * IA é a prova do candidato, e a promessa da Coploy é que ela substitui a
 * bateria de testes opacos — não que é mais uma etapa
 * .
 */
const emailCopyByLanguage: Record<string, InviteEmailCopy> = {
	'pt-BR': {
		jobFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Olá, ${candidateName}.` : 'Olá.'),
		body: (jobName, companyName) =>
			`Sua candidatura para ${jobName} na ${companyName} avançou: o próximo passo é a entrevista com nossa IA.`,
		howItWorks:
			'Você responde no seu tempo, de onde estiver, e não precisa marcar horário. Suas respostas vão direto para a equipe de recrutamento.',
		cta: 'Fazer a entrevista',
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Convite para entrevista — ${jobName} na ${companyName}`
			if (jobName) return `Convite para entrevista — ${jobName}`
			return 'Convite para entrevista'
		},
		preview: (jobName, companyName) =>
			`Você avançou no processo para ${jobName} na ${companyName}. Faça sua entrevista.`,
		footer: (brand: string) => `Este e-mail foi enviado por ${brand} em nome da equipe de recrutamento.`,
	},
	'pt-PT': {
		jobFallback: 'vaga',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Olá, ${candidateName}.` : 'Olá.'),
		body: (jobName, companyName) =>
			`A sua candidatura para ${jobName} na ${companyName} avançou: o próximo passo é a entrevista com a nossa IA.`,
		howItWorks:
			'Responde no seu tempo, onde estiver, sem marcar hora. As suas respostas seguem diretamente para a equipa de recrutamento.',
		cta: 'Fazer a entrevista',
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Convite para entrevista — ${jobName} na ${companyName}`
			if (jobName) return `Convite para entrevista — ${jobName}`
			return 'Convite para entrevista'
		},
		preview: (jobName, companyName) =>
			`Avançou no processo para ${jobName} na ${companyName}. Faça a sua entrevista.`,
		footer: (brand: string) => `Este e-mail foi enviado por ${brand} em nome da equipa de recrutamento.`,
	},
	en: {
		jobFallback: 'role',
		companyFallback: 'company',
		greeting: (candidateName) => (candidateName ? `Hello, ${candidateName}.` : 'Hello.'),
		body: (jobName, companyName) =>
			`Your application for ${jobName} at ${companyName} moved forward: the next step is an interview with our AI.`,
		howItWorks:
			'You answer on your own time, from anywhere, with no scheduling. Your answers go straight to the recruiting team.',
		cta: 'Start the interview',
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Interview invitation — ${jobName} at ${companyName}`
			if (jobName) return `Interview invitation — ${jobName}`
			return 'Interview invitation'
		},
		preview: (jobName, companyName) =>
			`You moved forward for ${jobName} at ${companyName}. Take your interview.`,
		footer: (brand: string) => `This email was sent by ${brand} on behalf of the recruiting team.`,
	},
	es: {
		jobFallback: 'vacante',
		companyFallback: 'empresa',
		greeting: (candidateName) => (candidateName ? `Hola, ${candidateName}.` : 'Hola.'),
		body: (jobName, companyName) =>
			`Tu candidatura para ${jobName} en ${companyName} avanzó: el siguiente paso es la entrevista con nuestra IA.`,
		howItWorks:
			'Respondes a tu ritmo, desde donde estés, sin agendar horario. Tus respuestas van directo al equipo de reclutamiento.',
		cta: 'Hacer la entrevista',
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Invitación a entrevista — ${jobName} en ${companyName}`
			if (jobName) return `Invitación a entrevista — ${jobName}`
			return 'Invitación a entrevista'
		},
		preview: (jobName, companyName) =>
			`Avanzaste en el proceso para ${jobName} en ${companyName}. Haz tu entrevista.`,
		footer: (brand: string) => `Este correo fue enviado por ${brand} en nombre del equipo de reclutamiento.`,
	},
	fr: {
		jobFallback: 'poste',
		companyFallback: 'entreprise',
		greeting: (candidateName) => (candidateName ? `Bonjour, ${candidateName}.` : 'Bonjour.'),
		body: (jobName, companyName) =>
			`Votre candidature pour ${jobName} chez ${companyName} a avancé : la prochaine étape est un entretien avec notre IA.`,
		howItWorks:
			"Vous répondez à votre rythme, où que vous soyez, sans prendre rendez-vous. Vos réponses vont directement à l'équipe de recrutement.",
		cta: "Passer l'entretien",
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Invitation à un entretien — ${jobName} chez ${companyName}`
			if (jobName) return `Invitation à un entretien — ${jobName}`
			return 'Invitation à un entretien'
		},
		preview: (jobName, companyName) =>
			`Vous avez avancé pour ${jobName} chez ${companyName}. Passez votre entretien.`,
		footer: (brand: string) => `Cet e-mail a été envoyé par ${brand} au nom de l'équipe de recrutement.`,
	},
	it: {
		jobFallback: 'posizione',
		companyFallback: 'azienda',
		greeting: (candidateName) => (candidateName ? `Ciao, ${candidateName}.` : 'Ciao.'),
		body: (jobName, companyName) =>
			`La tua candidatura per ${jobName} presso ${companyName} è avanzata: il prossimo passo è il colloquio con la nostra IA.`,
		howItWorks:
			'Rispondi quando vuoi, da dove vuoi, senza fissare un orario. Le tue risposte vanno direttamente al team di recruiting.',
		cta: 'Fai il colloquio',
		subject: (jobName, companyName) => {
			if (jobName && companyName) return `Invito al colloquio — ${jobName} presso ${companyName}`
			if (jobName) return `Invito al colloquio — ${jobName}`
			return 'Invito al colloquio'
		},
		preview: (jobName, companyName) =>
			`Sei avanzato per ${jobName} presso ${companyName}. Fai il tuo colloquio.`,
		footer: (brand: string) => `Questa email è stata inviata da ${brand} per conto del team di recruiting.`,
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

export function renderInterviewInviteEmail(params: InterviewInviteEmailParams): RenderedEmail {
	const language = getEmailLanguage(params.language)
	const copy = emailCopyByLanguage[language]
	const jobName = params.jobName?.trim() || copy.jobFallback
	const companyName = params.companyName?.trim() || copy.companyFallback
	const greeting = copy.greeting(params.candidateName?.trim())
	const body = copy.body(jobName, companyName)
	const subject = copy.subject(params.jobName?.trim(), params.companyName?.trim())
	const message = params.message?.trim()

	const bodyHtml = `
							<p style="Margin:0 0 16px 0;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:24px;color:#161014;">${escapeHtml(greeting)}</p>
							${renderParagraphs(body)}
							${message ? renderParagraphs(message) : ''}
							${renderParagraphs(copy.howItWorks)}
							<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="Margin:22px 0 0 0;border-collapse:collapse;">
								<tr>
									<td style="background-color:${accentOf(params.branding)};">
										<a href="${escapeHtml(params.interviewUrl)}" style="display:inline-block;padding:13px 26px;font-family:Arial, Helvetica, sans-serif;font-size:15px;font-weight:bold;color:${accentTextOf(params.branding)};text-decoration:none;">${escapeHtml(copy.cta)}</a>
									</td>
								</tr>
							</table>
							<p style="Margin:18px 0 0 0;font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:20px;color:#5d555a;word-break:break-all;">${escapeHtml(params.interviewUrl)}</p>
							<p style="Margin:14px 0 0 0;font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#5d555a;">${escapeHtml(copy.footer(params.branding?.companyName ?? 'Coploy'))}</p>`

	return {
		subject,
		htmlBody: renderEmailLayout({
			title: subject,
			previewText: copy.preview(jobName, companyName),
			bodyHtml,
			language,
			branding: params.branding ?? null,
		}),
		// O link cru também no texto: cliente que bloqueia HTML precisa dele.
		textBody: [greeting, body, message, copy.howItWorks, params.interviewUrl, copy.footer(params.branding?.companyName ?? 'Coploy')]
			.filter(Boolean)
			.join('\n\n'),
	}
}
