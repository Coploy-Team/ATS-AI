import {
	rejectionFeedbackPreviewData,
	renderRejectionFeedbackEmail,
} from '../rejection-feedback'
import { emailTheme } from '../theme'

describe('renderRejectionFeedbackEmail', () => {
	it('renders job name, company name and recruiter message in HTML', () => {
		const rendered = renderRejectionFeedbackEmail({
			candidateName: 'Ana Silva',
			jobName: 'Engenheira de Software',
			companyName: 'Coploy',
			message: 'Olá {{nomeCandidato}}, sua candidatura para {{nomeVaga}} na {{nomeDaEmpresa}} foi avaliada.',
		})

		expect(rendered.subject).toBe('Retorno sobre seu processo seletivo para Engenheira de Software na Coploy')
		expect(rendered.htmlBody).toContain('Engenheira de Software')
		expect(rendered.htmlBody).toContain('Coploy')
		expect(rendered.htmlBody).toContain('Olá Ana Silva, sua candidatura para Engenheira de Software na Coploy foi avaliada.')
	})

	it('renders Coploy logo in the header and a readable mailto support link in the footer', () => {
		const rendered = renderRejectionFeedbackEmail(rejectionFeedbackPreviewData)
		const escapedLogoUrl = emailTheme.logoUrl
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')

		expect(rendered.htmlBody).toContain(`src="${escapedLogoUrl}"`)
		expect(rendered.htmlBody).toContain(`alt="${emailTheme.brandName}"`)
		expect(rendered.htmlBody).toContain(
			`<a href="mailto:${emailTheme.supportEmail}" style="color:${emailTheme.colors.footerText};text-decoration:underline;">${emailTheme.supportEmail}</a>`,
		)
	})

	it('renders a plain text version', () => {
		const rendered = renderRejectionFeedbackEmail(rejectionFeedbackPreviewData)

		expect(rendered.textBody).toContain('Engenheira de Software')
		expect(rendered.textBody).toContain('Coploy')
		expect(rendered.textBody).toContain('Este e-mail foi enviado por Coploy')
	})

	it('renders the human review link in HTML and plain text when provided', () => {
		const rendered = renderRejectionFeedbackEmail({
			message: 'Obrigado pela participação.',
			jobName: 'Produto',
			companyName: 'Coploy',
			reviewUrl: 'https://interview.test/careers/company/jobs/job/applications/app/revisao',
		})

		expect(rendered.htmlBody).toContain('Pedir revisão humana')
		expect(rendered.htmlBody).toContain('https://interview.test/careers/company/jobs/job/applications/app/revisao')
		expect(rendered.textBody).toContain('Pedir revisão humana: https://interview.test/careers/company/jobs/job/applications/app/revisao')
	})

	it('renders localized static email copy', () => {
		const rendered = renderRejectionFeedbackEmail({
			message: 'Thank you for your participation.',
			jobName: 'Product Manager',
			companyName: 'Coploy',
			reviewUrl: 'https://interview.test/careers/company/jobs/job/applications/app/revisao',
			language: 'en',
		})

		expect(rendered.subject).toBe('Update about your hiring process for Product Manager at Coploy')
		expect(rendered.htmlBody).toContain('<html lang="en">')
		expect(rendered.htmlBody).toContain('Request human review')
		expect(rendered.textBody).toContain('If you disagree with this decision')
		expect(rendered.textBody).toContain('This email was sent by Coploy on behalf of the recruiting team.')
	})

	it('escapes HTML from recruiter-provided message', () => {
		const rendered = renderRejectionFeedbackEmail({
			message: '<script>alert("xss")</script>',
			jobName: 'Produto',
			companyName: 'Coploy',
		})

		expect(rendered.htmlBody).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
		expect(rendered.htmlBody).not.toContain('<script>alert')
	})

	/*
	 * Decisão 4 do ADR-009: quem fala com o candidato é a EMPRESA. O e-mail
	 * carrega a marca dela, e a Coploy vira assinatura discreta.
	 */
	it('veste o e-mail com a marca da empresa quando ela é passada', () => {
		const rendered = renderRejectionFeedbackEmail({
			...rejectionFeedbackPreviewData,
			branding: {
				companyName: 'Forkly Studio',
				logoUrl: 'https://cdn.exemplo/forkly.png',
				accentColor: '#cdfb12',
				accentTextColor: '#161014',
				showPoweredBy: true,
			},
		})

		expect(rendered.htmlBody).toContain('Forkly Studio')
		expect(rendered.htmlBody).toContain('https://cdn.exemplo/forkly.png')
		expect(rendered.htmlBody).toContain('#cdfb12')
		// assinatura discreta, não protagonista
		expect(rendered.htmlBody).toContain('powered by Coploy')
		expect(rendered.textBody).toContain('enviado por Forkly Studio')
	})
})
