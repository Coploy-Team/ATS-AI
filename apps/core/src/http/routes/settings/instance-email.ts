import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { isSelfHosted } from '@coploy/shared/env'
import { normalizeTenantRole } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'
import type { SmtpSettings } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { env } from '@/env'
import { sendSmtpTestEmail } from '@/lib/email-sender'

/**
 * Configuração de e-mail da INSTALAÇÃO — a seção de e-mail da tela Servidor
 * (item 7 + adendo da revisão da open, 2026-08-22).
 *
 * Só existe na distribuição open (`isSelfHosted`): no SaaS hospedado o
 * transporte é o Postmark da Coploy e nenhum cliente configura nada — aqui a
 * rota responde 404 e a tela nem aparece (feature `instanceConfig`).
 *
 * É configuração da INSTALAÇÃO, não da empresa (global_settings) — numa
 * instância com várias empresas, vale pra todas. Por isso o gate é o DONO,
 * não `settings:write`: editor de uma empresa não configura o servidor.
 * A senha nunca volta na leitura; update sem `pass` preserva a salva.
 */

const smtpInputSchema = z.object({
	host: z.string().min(1),
	port: z.number().int().min(1).max(65_535),
	secure: z.boolean(),
	user: z.string().nullable().optional(),
	pass: z.string().nullable().optional(),
	from: z.string().min(3),
})

const smtpPublicSchema = z.object({
	host: z.string(),
	port: z.number(),
	secure: z.boolean(),
	user: z.string().nullable(),
	from: z.string(),
	/** Há senha salva — a tela mostra "•••" sem nunca vê-la. */
	hasPassword: z.boolean(),
})

const statusSchema = z.object({
	/** Transporte que um envio usaria AGORA, na ordem de resolução real. */
	activeTransport: z.enum(['smtp-settings', 'smtp-env', 'postmark', 'none']),
	smtp: smtpPublicSchema.nullable(),
})

function toPublic(smtp: SmtpSettings): z.infer<typeof smtpPublicSchema> {
	return {
		host: smtp.host,
		port: smtp.port,
		secure: smtp.secure,
		user: smtp.user ?? null,
		from: smtp.from,
		hasPassword: Boolean(smtp.pass),
	}
}

export function instanceEmailRoutes(app: FastifyInstance) {
	const typed = app.withTypeProvider<ZodTypeProvider>().register(createAuth(app.infra))

	/*
	 * A MESMA resolução de papel do plugin de RBAC: o membership devolve só a
	 * empresa (não existe `.user` — o primeiro gate lia undefined e explodia);
	 * o papel vem do REGISTRO DE COLABORADOR do usuário, e não achar registro
	 * é `owner` por decisão de projeto (a base é anterior ao RBAC — o criador
	 * da conta nem tem colaborador vinculado).
	 */
	const requireOpenOwner = async (request: {
		getUserMembership: () => Promise<{ company: { id: string } }>
		getCurrentUser: () => Promise<string>
	}) => {
		if (!isSelfHosted()) throw new NotFoundError('Not found')
		const { company } = await request.getUserMembership()
		const userId = await request.getCurrentUser()
		let accessLevel: string | null = null
		try {
			const collaborators = (await app.infra.collaboratorRepository.listCollaborators(
				company.id,
			)) as unknown as Array<{ userRef?: { id?: string } | string | null; accessLevel?: string }>
			const mine = collaborators.find((item) => {
				const ref = typeof item.userRef === 'string' ? item.userRef : item.userRef?.id
				return ref === userId
			})
			accessLevel = mine?.accessLevel ?? null
		} catch {
			// falha ao LER o papel não vira bloqueio (mesma régua do plugin RBAC)
		}
		if (normalizeTenantRole(accessLevel) !== 'owner') {
			throw new BadRequestError('Somente o dono da conta configura o servidor')
		}
	}

	typed.get(
		'/settings/instance/email',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['settings'],
				security: [{ bearerAuth: [] }],
				summary: 'Instance email transport (open edition, owner only)',
				response: { 200: statusSchema, 404: z.object({ message: z.string() }) },
			},
		},
		async (request) => {
			await requireOpenOwner(request as never)
			const settings = await app.infra.globalSettingsRepository.get()
			const activeTransport = settings.smtp?.host
				? ('smtp-settings' as const)
				: (env as { SMTP_HOST?: string }).SMTP_HOST
					? ('smtp-env' as const)
					: env.POSTMARK_API_KEY
						? ('postmark' as const)
						: ('none' as const)
			return {
				activeTransport,
				smtp: settings.smtp?.host ? toPublic(settings.smtp) : null,
			}
		},
	)

	typed.put(
		'/settings/instance/email',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['settings'],
				security: [{ bearerAuth: [] }],
				summary: 'Save (or clear, with null) the instance SMTP settings',
				body: z.object({ smtp: smtpInputSchema.nullable() }),
				response: { 200: statusSchema, 404: z.object({ message: z.string() }) },
			},
		},
		async (request) => {
			await requireOpenOwner(request as never)
			const current = await app.infra.globalSettingsRepository.get()
			const input = request.body.smtp
			const smtp: SmtpSettings | null = input
				? {
						host: input.host,
						port: input.port,
						secure: input.secure,
						user: input.user ?? null,
						// pass omitido/vazio no update NÃO apaga a senha salva — a tela
						// nunca a recebe de volta, então não tem como reenviá-la.
						pass: input.pass || current.smtp?.pass || null,
						from: input.from,
					}
				: null
			const userId = await (request as never as { getCurrentUser: () => Promise<string> })
				.getCurrentUser()
			const updated = await app.infra.globalSettingsRepository.update({ smtp }, userId)
			return {
				activeTransport: updated.smtp?.host
					? ('smtp-settings' as const)
					: (env as { SMTP_HOST?: string }).SMTP_HOST
						? ('smtp-env' as const)
						: env.POSTMARK_API_KEY
							? ('postmark' as const)
							: ('none' as const),
				smtp: updated.smtp?.host ? toPublic(updated.smtp) : null,
			}
		},
	)

	typed.post(
		'/settings/instance/email/test',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['settings'],
				security: [{ bearerAuth: [] }],
				summary: 'Send a test email using the given (or saved) SMTP settings',
				body: z.object({
					to: z.string().email(),
					smtp: smtpInputSchema.nullable().optional(),
				}),
				response: {
					200: z.object({ ok: z.literal(true) }),
					400: z.object({ message: z.string() }),
					404: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			await requireOpenOwner(request as never)
			const saved = (await app.infra.globalSettingsRepository.get()).smtp ?? null
			const input = request.body.smtp
			const smtp: SmtpSettings | null = input
				? { ...input, user: input.user ?? null, pass: input.pass || saved?.pass || null }
				: saved
			if (!smtp?.host) throw new BadRequestError('Configure o SMTP antes de testar')
			try {
				await sendSmtpTestEmail(smtp, request.body.to)
			} catch (error) {
				// o motivo REAL do provedor é o que destrava a pessoa (auth, porta,
				// TLS...) — engolir numa mensagem genérica só gera tentativa cega
				throw new BadRequestError(
					`Falha no envio de teste: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
			return { ok: true as const }
		},
	)
}
