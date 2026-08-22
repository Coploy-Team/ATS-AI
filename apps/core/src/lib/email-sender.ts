import nodemailer, { type Transporter } from 'nodemailer'

import type { SmtpSettings } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

import { env } from '@/env'
import { PostmarkClient } from '@/lib/postmark-client'

/**
 * Transporte de e-mail com resolução por instalação (item 7 da revisão da
 * open, 2026-08-22). Ordem:
 *
 * 1. SMTP configurado na tela Servidor (global_settings) — o caminho da
 *    distribuição open: o operador pluga Gmail/SES/Mailgun/postfix sem
 *    redeploy.
 * 2. SMTP por env (SMTP_HOST...) — quem prefere infra-as-code.
 * 3. Postmark (POSTMARK_API_KEY) — o SaaS hospedado da Coploy.
 * 4. Nada configurado → erro claro; quem chama já tolera falha de envio
 *    (nenhum fluxo de produto derruba a operação por e-mail que não saiu).
 *
 * Com SMTP, o remetente é o `from` CONFIGURADO, não o que o chamador passou:
 * os fluxos antigos mandam "suporte@coploy.io" fixo, e provedor SMTP recusa
 * (ou marca como spam) envelope que não bate com a conta autenticada.
 */

export interface SendEmailParams {
	from: string
	to: string | string[]
	subject: string
	htmlBody: string
	textBody?: string
	tag?: string
}

export interface EmailSender {
	/** Retorno normalizado entre transportes — o que os fluxos usam é o id. */
	sendEmail(params: SendEmailParams): Promise<{ MessageID: string }>
}

function envSmtp(): SmtpSettings | null {
	const e = env as {
		SMTP_HOST?: string
		SMTP_PORT?: number
		SMTP_SECURE?: boolean
		SMTP_USER?: string
		SMTP_PASS?: string
		SMTP_FROM?: string
	}
	if (!e.SMTP_HOST || !e.SMTP_FROM) return null
	return {
		host: e.SMTP_HOST,
		port: e.SMTP_PORT ?? 587,
		secure: e.SMTP_SECURE ?? false,
		user: e.SMTP_USER ?? null,
		pass: e.SMTP_PASS ?? null,
		from: e.SMTP_FROM,
	}
}

const SETTINGS_CACHE_MS = 60_000

export function createEmailSender(infra: InfraProvider): EmailSender {
	let cached: { smtp: SmtpSettings | null; at: number } | null = null
	let transporter: { key: string; instance: Transporter } | null = null

	async function resolveSmtp(): Promise<SmtpSettings | null> {
		if (cached && Date.now() - cached.at < SETTINGS_CACHE_MS) return cached.smtp
		const settings = await infra.globalSettingsRepository.get().catch(() => null)
		const smtp = settings?.smtp?.host ? settings.smtp : envSmtp()
		cached = { smtp, at: Date.now() }
		return smtp
	}

	function transporterFor(smtp: SmtpSettings): Transporter {
		const key = JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.user])
		if (transporter?.key !== key) {
			transporter = {
				key,
				instance: nodemailer.createTransport({
					host: smtp.host,
					port: smtp.port,
					secure: smtp.secure,
					auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
				}),
			}
		}
		return transporter.instance
	}

	return {
		async sendEmail(params) {
			const smtp = await resolveSmtp()
			if (smtp) {
				const info = await transporterFor(smtp).sendMail({
					from: smtp.from,
					to: Array.isArray(params.to) ? params.to.join(',') : params.to,
					subject: params.subject,
					html: params.htmlBody,
					text: params.textBody || undefined,
				})
				return { MessageID: info.messageId ?? '' }
			}
			if (env.POSTMARK_API_KEY) {
				return new PostmarkClient().sendEmail(params)
			}
			throw new BadRequestError(
				'Nenhum transporte de e-mail configurado (SMTP na tela Servidor, SMTP_* no ambiente ou POSTMARK_API_KEY)',
			)
		},
	}
}

/** Envio de teste da tela Servidor — usa a config INFORMADA, não a salva. */
export async function sendSmtpTestEmail(smtp: SmtpSettings, to: string): Promise<void> {
	const instance = nodemailer.createTransport({
		host: smtp.host,
		port: smtp.port,
		secure: smtp.secure,
		auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
	})
	await instance.sendMail({
		from: smtp.from,
		to,
		subject: 'Coploy ATS — teste de e-mail',
		html: '<p>Se este e-mail chegou, o transporte SMTP da sua instalação está funcionando.</p>',
		text: 'Se este e-mail chegou, o transporte SMTP da sua instalação está funcionando.',
	})
}
