import type { Capability, TenantRole } from '@coploy/domain'
import { can, normalizeTenantRole } from '@coploy/domain'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { InfraProvider } from '@coploy/infra'

import { findCollaborator } from '@/lib/collaborator-identity'
import { capabilityFor } from '@/http/policy/route-capabilities'

/**
 * Autorização por capability, aplicada a TODA rota de empresa.
 *
 * A primeira leva (V2-301) protegia rota a rota, embrulhando cada registro. Deu
 * 22 de 162: quem escrevia uma rota nova não tinha por que lembrar do guard, e
 * a maior parte da superfície ficou sem autorização nenhuma além de "está
 * logado e pertence a alguma empresa".
 *
 * Aqui o caminho se inverte. O guard é ligado às rotas de empresa no `onRoute`,
 * descobre a capability pela tabela e decide. Esquecer de mapear não abre a
 * rota em silêncio: cai no ramo `unmapped`, que é logado e, com enforcement
 * ligado, bloqueia.
 *
 * ## Por que `onRoute` e não `addHook('preHandler')` global
 *
 * O `getUserMembership` NÃO é um decorator de boot: o `createAuthMiddleware`
 * (packages/shared) o instala dentro de um `preHandler` próprio. Hooks de
 * instância rodam na ordem em que foram adicionados, e este aqui era o
 * primeiro de todos — então, no momento em que ele rodava, `getUserMembership`
 * ainda não existia, a chamada lançava `TypeError` e o `catch` devolvia o
 * request para a rota. Resultado: nenhum request era avaliado, nem para
 * bloquear nem para logar. O shadow parecia limpo porque estava desligado.
 *
 * Anexando o guard ao `preHandler` DA ROTA, ele passa a rodar depois de todos
 * os hooks de instância — inclusive o que decora o request — independentemente
 * de quem foi registrado primeiro. A capability também sai resolvida no boot,
 * uma vez por rota, em vez de a cada request.
 */
const ENFORCE_ENV = 'RBAC_ENFORCE'

interface RouteLike {
	url: string
	method: string | string[]
	schema?: unknown
	preHandler?: unknown
}

export function registerRbac(app: FastifyInstance, infra: InfraProvider) {
	/*
	 * Cache por request-cycle não serve aqui (cada request é um ciclo), mas o
	 * papel muda com pouquíssima frequência e a leitura é uma listagem inteira
	 * de colaboradores. TTL curto: erra por no máximo um minuto quando alguém
	 * muda de papel, e evita uma leitura extra em cada chamada de API.
	 */
	const roleCache = new Map<string, { role: TenantRole; expiresAt: number }>()
	const ROLE_TTL_MS = 60_000

	app.addHook('onRoute', (route: RouteLike) => {
		const schema = route.schema as { 'x-surface'?: string } | undefined
		// só a superfície de empresa tem papéis; candidato e público não têm tenant
		if (schema?.['x-surface'] !== 'empresa') return

		/*
		 * Resolvido no boot: a rota é a mesma em todo request, e assim um buraco
		 * na tabela vira um `undefined` visível aqui em vez de trabalho repetido.
		 */
		const methods = Array.isArray(route.method) ? route.method : [route.method]
		const byMethod = new Map<string, Capability | undefined>(
			methods.map((method) => [method.toUpperCase(), capabilityFor(method, route.url)]),
		)

		const guard = async (request: FastifyRequest, reply: FastifyReply) => {
			const capability = byMethod.get(request.method.toUpperCase())
			const enforcing = process.env[ENFORCE_ENV] === 'true'

			let membership: { company: { id: string }; user?: { email?: string | null } }
			let userId: string | null
			try {
				membership = (await request.getUserMembership()) as typeof membership
				userId = await request.getCurrentUser().catch(() => null)
			} catch (error) {
				/*
				 * Sem membership não há o que autorizar — e negar aqui transformaria
				 * este guard no responsável pela AUTENTICAÇÃO, que é de outro
				 * middleware. A rota segue e falha (ou não) pelo caminho dela.
				 *
				 * O log distingue os dois motivos porque eles são doenças diferentes:
				 * token inválido é rotina, request sem o decorator é o guard tendo
				 * sido montado no lugar errado — e foi assim que ele passou um dia
				 * inteiro sem avaliar nada.
				 */
				if (typeof request.getUserMembership !== 'function') {
					log({ tag: 'rbac.no_auth_hook', route: route.url, method: request.method })
				}
				void error
				return
			}

			if (!capability) {
				// buraco na tabela: nunca silencioso, e fechado quando enforcing
				log({
					tag: 'rbac.unmapped',
					enforcing,
					route: route.url,
					method: request.method,
					companyId: membership.company.id,
					userId,
				})
				if (enforcing) {
					return reply
						.status(403)
						.send({ message: 'Rota sem política de acesso definida' })
				}
				return
			}

			const role = await resolveRole(
				infra,
				membership.company.id,
				userId,
				membership.user?.email ?? null,
				roleCache,
				ROLE_TTL_MS,
			)
			if (can(role, capability)) return

			log({
				tag: 'rbac.denied',
				enforcing,
				capability,
				role,
				companyId: membership.company.id,
				userId,
				route: route.url,
				method: request.method,
			})

			if (enforcing) {
				return reply
					.status(403)
					.send({ message: 'Seu perfil não permite esta ação', capability, role })
			}
		}

		const existing = route.preHandler
		route.preHandler = Array.isArray(existing)
			? [...existing, guard]
			: existing
				? [existing, guard]
				: [guard]
	})
}

/** Estruturado de propósito: é o dado que decide quando virar a chave. */
function log(payload: Record<string, unknown>) {
	console.warn(JSON.stringify(payload))
}

async function resolveRole(
	infra: InfraProvider,
	companyId: string,
	userId: string | null,
	userEmail: string | null,
	cache: Map<string, { role: TenantRole; expiresAt: number }>,
	ttlMs: number,
): Promise<TenantRole> {
	if (!userId) return normalizeTenantRole(null)

	const key = `${companyId}:${userId}`
	const cached = cache.get(key)
	const now = Date.now()
	if (cached && cached.expiresAt > now) return cached.role

	let role: TenantRole
	try {
		const collaborators = (await infra.collaboratorRepository.listCollaborators(
			companyId,
		)) as unknown as Array<Record<string, unknown>>
		/*
		 * O colaborador guarda a identidade em `userRef` (referência ao doc do
		 * usuário) — NUNCA em `userId`/`uuid`, que era o que este código procurava.
		 * O `find` não casava com ninguém, `accessLevel` vinha `undefined`, e
		 * `normalizeTenantRole(undefined)` devolve `owner` por decisão de projeto.
		 */
		const mine = findCollaborator(collaborators, userId, userEmail)
		role = normalizeTenantRole(mine?.accessLevel as string | undefined)
	} catch {
		// falha ao LER o papel não pode virar bloqueio: seria indisponibilidade
		// do repositório virando negação de acesso
		role = normalizeTenantRole(null)
	}

	cache.set(key, { role, expiresAt: now + ttlMs })
	return role
}

export type { Capability }
