/**
 * Templates de e-mail editáveis (V2-503).
 *
 * Os quatro templates são hardcoded: mudar uma frase exige deploy nosso. Mas a
 * comunicação com o candidato é a marca do CLIENTE, não a nossa — e cada pedido
 * de ajuste vira ticket de suporte.
 *
 * ⚠️ O template do banco é OPCIONAL. Sem ele, ou com ele inválido, o e-mail sai
 * pelo código — nunca deixa de sair. Comunicação com candidato é o coração do
 * anti-ghosting; falhar aqui é o defeito que o produto inteiro combate.
 */

export const EMAIL_TEMPLATE_KINDS = [
	'interview_invite',
	'rejection_feedback',
	'application_ack',
	'profile_request',
] as const
export type EmailTemplateKind = (typeof EMAIL_TEMPLATE_KINDS)[number]

export interface EmailTemplate {
	id: string
	companyId: string
	kind: EmailTemplateKind
	subject: string
	/** Corpo em texto com variáveis `{{candidato}}`, `{{vaga}}`, `{{empresa}}`. */
	body: string
	active: boolean
	updatedByUserId?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
}

/** Variáveis que o produto garante — as únicas seguras de usar. */
export const EMAIL_TEMPLATE_VARIABLES = ['candidato', 'vaga', 'empresa', 'link'] as const

/**
 * Substitui as variáveis conhecidas.
 *
 * Variável desconhecida é deixada como está, em vez de virar string vazia: o
 * cliente vê `{{salario}}` no preview e entende que errou, em branco ele acha
 * que o dado sumiu.
 */
export function renderTemplate(text: string, values: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
		key in values ? values[key] : match,
	)
}

/** Erros de um template — vazio significa que pode salvar. */
export function validateTemplate(subject: string, body: string): string[] {
	const errors: string[] = []
	if (!subject.trim()) errors.push('Assunto vazio')
	if (!body.trim()) errors.push('Corpo vazio')

	const unknown = [...body.matchAll(/\{\{(\w+)\}\}/g)]
		.map((match) => match[1])
		.filter((key) => !(EMAIL_TEMPLATE_VARIABLES as readonly string[]).includes(key))

	if (unknown.length > 0) {
		errors.push(`Variáveis desconhecidas: ${[...new Set(unknown)].join(', ')}`)
	}
	return errors
}
