import type { EmailTemplateKind } from '@coploy/domain'
import { renderTemplate } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * O template da empresa aplicado ao e-mail que sai.
 *
 * ## O problema
 *
 * `/companies/email-templates` guardava assunto e corpo desde a onda 5, e
 * **nenhum caminho de envio lia isso**. `renderTemplate` estava exportado do
 * domain e nunca era chamado: o cliente podia editar o texto à vontade e o
 * candidato continuava recebendo o que estava escrito no nosso código. Uma
 * tabela de textos que ninguém lê é pior que a ausência da funcionalidade,
 * porque promete controle que não existe.
 *
 * ## A costura
 *
 * Os quatro renderizadores devolvem o mesmo `{subject, htmlBody, textBody}` e
 * mantêm o layout da marca. Então o override entra ANTES da renderização, como
 * assunto e mensagem — e não substituindo o HTML inteiro. O cliente controla o
 * texto; nós continuamos controlando que o e-mail seja legível em Outlook.
 *
 * Empresa sem template configurado segue com a cópia padrão. Ausência é o caso
 * comum e não pode custar nada.
 */
export interface ResolvedTemplate {
	subject: string | null
	body: string | null
}

export interface TemplateValues {
	candidato?: string | null
	vaga?: string | null
	empresa?: string | null
	link?: string | null
}

export function createEmailTemplateResolver(infra: InfraProvider) {
	return {
		/**
		 * Assunto e corpo já com as variáveis trocadas, ou `null` quando a empresa
		 * não configurou nada.
		 *
		 * Falha de leitura devolve `null` em vez de propagar: o template é um
		 * enfeite sobre um e-mail que precisa sair. Deixar o Firestore indisponível
		 * bloquear a resposta ao candidato inverteria a prioridade — e o
		 * anti-ghosting é justamente a promessa de que a resposta sai.
		 */
		async resolve(
			companyId: string,
			kind: EmailTemplateKind,
			values: TemplateValues,
		): Promise<ResolvedTemplate> {
			try {
				const templates = (await infra.orgRepository.listEmailTemplates(companyId)) as Array<{
					kind?: string
					subject?: string | null
					body?: string | null
					active?: boolean
				}>
				const template = templates.find((item) => item.kind === kind && item.active !== false)
				if (!template) return { subject: null, body: null }

				const dictionary: Record<string, string> = {
					candidato: values.candidato?.trim() || '',
					vaga: values.vaga?.trim() || '',
					empresa: values.empresa?.trim() || '',
					link: values.link?.trim() || '',
				}

				return {
					subject: template.subject?.trim()
						? renderTemplate(template.subject, dictionary)
						: null,
					body: template.body?.trim() ? renderTemplate(template.body, dictionary) : null,
				}
			} catch (error) {
				console.warn(
					JSON.stringify({ tag: 'emailTemplate.resolveFailed', companyId, kind, error: String(error) }),
				)
				return { subject: null, body: null }
			}
		},
	}
}

/** Aplica o assunto customizado sobre o e-mail já renderizado. */
export function withCustomSubject<T extends { subject: string }>(
	rendered: T,
	subject: string | null,
): T {
	return subject ? { ...rendered, subject } : rendered
}
