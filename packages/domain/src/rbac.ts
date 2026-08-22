/**
 * Papéis e capabilities do tenant (V2-301).
 *
 * ⚠️ Construído SOBRE o que já existe. `Collaborator.accessLevel` já tem
 * `owner | editor | shared`, é persistido e já orienta a navegação do dashboard
 * — o que faltava é ele valer no BACKEND. Inventar um campo novo criaria duas
 * fontes de verdade e deixaria o dado antigo sem papel.
 *
 * A matriz de 6 perfis do blueprint (admin_tenant, admin_rh, recrutador,
 * gestor, colaborador, candidato) é o destino; este é o passo que torna a
 * autorização real sem quebrar quem já usa o produto.
 */

export const TENANT_ROLES = ['owner', 'editor', 'shared'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

/**
 * Capabilities são verbos de negócio, não rotas.
 *
 * Amarrar permissão a rota faz a matriz apodrecer a cada endpoint novo; amarrar
 * a verbo faz a rota nova nascer perguntando "que capability é essa?".
 */
export const CAPABILITIES = [
	/*
	 * Qualquer membro do tenant. Existe para que rotas como "meu perfil" e
	 * "minhas notificações" possam ser MAPEADAS em vez de ficarem de fora da
	 * política — buraco na tabela é como a cobertura apodrece sem ninguém ver.
	 */
	'tenant:member',
	'job:read',
	'job:write',
	'job:delete',
	'candidate:read',
	'candidate:move',
	'candidate:reject',
	'candidate:unlock',
	'team:read',
	'team:write',
	'settings:read',
	'settings:write',
	'billing:read',
	'billing:write',
	'integration:read',
	'integration:write',
	/** Painéis e relatórios: leitura agregada, sem tocar em pessoa. */
	'analytics:read',
	/** Banco de talentos (hunting) — não é a base da empresa, é o pool. */
	'talent:read',
	/** Geração por IA. Separada porque **gasta crédito**: é dinheiro, não leitura. */
	'ai:use',
] as const
export type Capability = (typeof CAPABILITIES)[number]

/**
 * Quem pode o quê.
 *
 * `shared` é o papel de leitura que o produto já usava para convidados: vê
 * candidatos e vagas, não mexe. `editor` opera o dia a dia mas não toca em
 * dinheiro nem em quem tem acesso — as duas coisas que um recrutador não
 * deveria mudar sozinho. `owner` faz tudo.
 */
const MATRIX: Record<TenantRole, readonly Capability[]> = {
	owner: CAPABILITIES,
	editor: [
		'tenant:member',
		'job:read',
		'job:write',
		'candidate:read',
		'candidate:move',
		'candidate:reject',
		'candidate:unlock',
		'team:read',
		'settings:read',
		'billing:read',
		'integration:read',
		'analytics:read',
		'talent:read',
		'ai:use',
	],
	/*
	 * `shared` é convidado de revisão. Vê a vaga e o candidato que lhe mostraram
	 * e lê o painel; NÃO navega o banco de talentos nem dispara geração por IA —
	 * um é a base inteira da empresa, o outro gasta crédito de quem convidou.
	 */
	shared: [
		'tenant:member',
		'job:read',
		'candidate:read',
		'team:read',
		'settings:read',
		'analytics:read',
	],
}

/** Papel de quem não tem `accessLevel` gravado — o dado legado é a maioria. */
export const DEFAULT_TENANT_ROLE: TenantRole = 'owner'

export function normalizeTenantRole(value?: string | null): TenantRole {
	const normalized = (value ?? '').trim().toLowerCase()
	return (TENANT_ROLES as readonly string[]).includes(normalized)
		? (normalized as TenantRole)
		: /*
		   * Ausente = `owner`, deliberadamente.
		   *
		   * A base inteira foi criada antes do RBAC e não tem `accessLevel`. Tratar
		   * ausência como papel restrito trancaria todo mundo fora do próprio dado
		   * no dia do deploy — o oposto do que a autorização deve fazer. Quem quer
		   * restringir passa a atribuir papel explicitamente.
		   */
			DEFAULT_TENANT_ROLE
}

export function can(role: TenantRole, capability: Capability): boolean {
	return MATRIX[role].includes(capability)
}

export function capabilitiesOf(role: TenantRole): readonly Capability[] {
	return MATRIX[role]
}
