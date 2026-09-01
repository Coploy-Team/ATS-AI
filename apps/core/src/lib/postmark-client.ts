/**
 * Stub do espelho público.
 *
 * A Coploy hospedada envia por Postmark. Esta distribuição envia por SMTP,
 * configurado na tela Servidor ou por variável de ambiente — e é isso que o
 * `email-sender` tenta primeiro.
 *
 * O stub existe em vez da remoção porque seis pontos do core importam este
 * cliente, entre eles a redefinição de senha. Sem ele o build do clone
 * quebraria; com ele, quem chegar aqui sem SMTP configurado ouve o motivo em
 * vez de ver um erro de módulo faltando.
 */
const SEM_PROVEDOR =
	'Nenhum provedor de e-mail configurado. Configure o SMTP em Configuração → Servidor (ou pelas variáveis SMTP_*).'

export interface PostmarkEmail {
	from: string
	to: string | string[]
	subject?: string
	htmlBody?: string
	textBody?: string
	messageStream?: string
	templateId?: number
	templateModel?: Record<string, unknown>
	tag?: string
}

/**
 * As assinaturas são permissivas de propósito: o stub existe para o build do
 * clone passar, e apertar tipo aqui só faria o espelho quebrar em cada
 * chamador que a edição hospedada tem e esta não exercita.
 */
export class PostmarkClient {
	constructor(_apiKey?: string) {}

	async sendEmail(_email: PostmarkEmail): Promise<never> {
		throw new Error(SEM_PROVEDOR)
	}

	async sendEmailBatch(_emails: PostmarkEmail[]): Promise<never> {
		throw new Error(SEM_PROVEDOR)
	}

	async sendEmailWithTemplate(_email: PostmarkEmail): Promise<never> {
		throw new Error(SEM_PROVEDOR)
	}

	async exportMessages(..._args: unknown[]): Promise<{
		messages: unknown[]
		pagination: Record<string, never> & Record<string, any>
	}> {
		throw new Error(SEM_PROVEDOR)
	}
}

export const postmarkClient = new PostmarkClient()
