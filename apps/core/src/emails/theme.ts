// TODO(dev): reconciliar estes tokens com o design system quando ele estabilizar.
export const emailTheme = {
	brandName: 'Coploy',
	// O logo vem do ambiente. Cravar a URL do nosso bucket faz QUALQUER
	// instalação — inclusive a open, na infra de outra empresa — renderizar a
	// marca da Coploy e consumir o nosso Storage. Ausente = e-mail sem logo,
	// que é honesto; a marca por empresa é resolvida pelo email-branding-service.
	logoUrl: process.env.EMAIL_LOGO_URL ?? '',
	colors: {
		background: '#f6f4f6',
		surface: '#ffffff',
		text: '#161014',
		mutedText: '#5d555a',
		accent: '#e12d7b',
		accentDark: '#b91f61',
		border: '#e7dde4',
		footer: '#121011',
		footerText: '#f6eef3',
	},
	fontFamily: 'Arial, Helvetica, sans-serif',
	maxWidth: 600,
	supportEmail: 'suporte@coploy.io',
}
