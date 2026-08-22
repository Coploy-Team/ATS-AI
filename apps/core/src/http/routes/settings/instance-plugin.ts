import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { isSelfHosted } from '@coploy/shared/env'
import { normalizeTenantRole } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'
import type { MotorPluginSettings } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { env } from '@/env'

/**
 * Licença do plugin Motor da INSTALAÇÃO — seção Plugin da tela Servidor
 * (ADR-008, fase 1). Mesmo gate da seção de e-mail: distribuição open + dono.
 *
 * O PUT guarda a chave e a valida na hora contra o servidor de licenças da
 * Coploy (`MOTOR_LICENSE_SERVER_URL`). Rede fora ≠ chave ruim: `unreachable`
 * é estado próprio, a chave fica salva e o próximo contato resolve. A chave
 * nunca volta inteira na leitura (últimos 4, como cartão).
 */

const licenseStatusSchema = z.object({
	/** null = nenhuma chave configurada. */
	license: z
		.object({
			/** Só o sufixo: "…a1b2". */
			keyHint: z.string(),
			status: z.enum(['active', 'invalid', 'revoked', 'unreachable']),
			plan: z.string().nullable(),
			activatedAt: z.string().nullable(),
			lastCheckedAt: z.string().nullable(),
			lastError: z.string().nullable(),
		})
		.nullable(),
	/** Serviços do Motor instalados (envs MOTOR_*) — estado SEPARADO da licença. */
	motorInstalled: z.boolean(),
})

function toPublic(settings: MotorPluginSettings | null | undefined) {
	if (!settings?.licenseKey) return null
	return {
		keyHint: `…${settings.licenseKey.slice(-4)}`,
		status: settings.status,
		plan: settings.plan ?? null,
		activatedAt: settings.activatedAt ?? null,
		lastCheckedAt: settings.lastCheckedAt ?? null,
		lastError: settings.lastError ?? null,
	}
}

async function callLicenseServer(
	licenseKey: string,
): Promise<{ status: 'active' | 'invalid' | 'revoked'; plan?: string } | { networkError: string }> {
	try {
		const response = await fetch(`${env.MOTOR_LICENSE_SERVER_URL}/plugin/motor/activate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				licenseKey,
				instance: { version: process.env.npm_package_version ?? null },
			}),
			signal: AbortSignal.timeout(10_000),
		})
		if (!response.ok) {
			return { networkError: `Servidor de licenças respondeu ${response.status}` }
		}
		const body = (await response.json()) as { status?: string; plan?: string }
		if (body.status === 'active' || body.status === 'invalid' || body.status === 'revoked') {
			return { status: body.status, plan: body.plan }
		}
		return { networkError: 'Resposta inesperada do servidor de licenças' }
	} catch (error) {
		return {
			networkError: error instanceof Error ? error.message : 'Falha de rede desconhecida',
		}
	}
}

export function instancePluginRoutes(app: FastifyInstance) {
	const typed = app.withTypeProvider<ZodTypeProvider>().register(createAuth(app.infra))

	// mesma resolução de papel da tela de e-mail (ver instance-email.ts)
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
		'/settings/instance/plugin',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['settings'],
				security: [{ bearerAuth: [] }],
				summary: 'Motor plugin license status (open edition, owner only)',
				response: { 200: licenseStatusSchema, 404: z.object({ message: z.string() }) },
			},
		},
		async (request) => {
			await requireOpenOwner(request)
			const settings = await app.infra.globalSettingsRepository.get()
			return {
				license: toPublic(settings.motorPlugin),
				motorInstalled: (env as { MOTOR_ENABLED?: boolean }).MOTOR_ENABLED === true,
			}
		},
	)

	typed.put(
		'/settings/instance/plugin',
		{
			schema: {
				'x-surface': 'empresa',
				tags: ['settings'],
				security: [{ bearerAuth: [] }],
				summary: 'Save + activate Motor plugin license key (open edition, owner only)',
				body: z.object({
					/** String vazia remove a licença. */
					licenseKey: z.string().max(200),
				}),
				response: {
					200: licenseStatusSchema,
					400: z.object({ message: z.string() }),
					404: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			await requireOpenOwner(request)
			const userId = await request.getCurrentUser()
			const licenseKey = request.body.licenseKey.trim()

			if (!licenseKey) {
				await app.infra.globalSettingsRepository.update({ motorPlugin: null }, userId)
				return {
					license: null,
					motorInstalled: (env as { MOTOR_ENABLED?: boolean }).MOTOR_ENABLED === true,
				}
			}

			const now = new Date().toISOString()
			const current = (await app.infra.globalSettingsRepository.get()).motorPlugin
			const verdict = await callLicenseServer(licenseKey)

			const next: MotorPluginSettings =
				'networkError' in verdict
					? {
							licenseKey,
							/*
							 * Rede fora não é chave ruim: guarda a chave, marca o estado e
							 * preserva plano/ativação anteriores se era a MESMA chave.
							 */
							status: 'unreachable',
							plan: current?.licenseKey === licenseKey ? (current?.plan ?? null) : null,
							activatedAt:
								current?.licenseKey === licenseKey ? (current?.activatedAt ?? null) : null,
							lastCheckedAt: now,
							lastError: verdict.networkError,
						}
					: {
							licenseKey,
							status: verdict.status,
							plan: verdict.status === 'active' ? (verdict.plan ?? null) : null,
							activatedAt: verdict.status === 'active' ? now : null,
							lastCheckedAt: now,
							lastError: null,
						}

			const saved = await app.infra.globalSettingsRepository.update({ motorPlugin: next }, userId)
			return {
				license: toPublic(saved.motorPlugin),
				motorInstalled: (env as { MOTOR_ENABLED?: boolean }).MOTOR_ENABLED === true,
			}
		},
	)
}
