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

/**
 * Todos os papéis que o sistema SABE avaliar — inclui o legado.
 *
 * `editor` continua aqui porque existe gravado na base: ele é o papel que via
 * a empresa inteira antes de haver escopo. Rebaixá-lo em migração encolheria,
 * sem aviso, o que cada cliente enxerga hoje. Ele deixa de ser OFERECIDO
 * (ver `ASSIGNABLE_ROLES`), mas quem já tem continua funcionando igual.
 */
export const TENANT_ROLES = ['owner', 'admin', 'recruiter', 'editor', 'shared'] as const
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
 * Papéis que a tela de Time oferece ao atribuir.
 *
 * `editor` fica de fora: é legado (ver `TENANT_ROLES`). Quem for criado de
 * agora em diante escolhe entre dono, administrador, recrutador e convidado.
 */
export const ASSIGNABLE_ROLES = ['owner', 'admin', 'recruiter', 'shared'] as const

/**
 * Quem pode o quê.
 *
 * A escada tem quatro degraus e cada um existe por um motivo:
 *
 * - `owner` é quem responde pela conta: faz tudo, inclusive dinheiro.
 * - `admin` opera a empresa inteira e **cuida dos acessos** — é o gestor de
 *   recrutamento. Não mexe em cobrança: administrar quem entra não é o mesmo
 *   que administrar a fatura, e juntar os dois obrigaria a dar cartão de
 *   crédito a quem só precisa gerenciar time.
 * - `recruiter` trabalha nas próprias vagas. Mesmas ações do dia a dia, alcance
 *   menor — o corte não está no que ele PODE fazer, está em ONDE (`jobScopeOf`).
 * - `shared` é convidado de revisão: vê o que lhe mostraram e não mexe.
 */
const MATRIX: Record<TenantRole, readonly Capability[]> = {
	owner: CAPABILITIES,
	/*
	 * Tudo do dia a dia mais `team:write` (é o "gerencia os acessos" do pedido),
	 * menos `billing:write` — a fatura continua sendo do dono.
	 */
	admin: CAPABILITIES.filter((c) => c !== 'billing:write'),
	/*
	 * As MESMAS capacidades operacionais do editor. A diferença não é de verbo,
	 * é de alcance: `jobScopeOf('recruiter') === 'own'`. Sem `team:write` e sem
	 * `settings:write` — quem opera a própria vaga não muda a régua da empresa.
	 */
	recruiter: [
		'tenant:member',
		'job:read',
		'job:write',
		'job:delete',
		'candidate:read',
		'candidate:move',
		'candidate:reject',
		'candidate:unlock',
		/*
		 * SEM `team:read` e SEM `settings:read`.
		 *
		 * Estavam aqui na primeira versão e o teste do Henrique mostrou o
		 * problema: a lista do Time é o mapa de quem é quem na empresa, e a
		 * configuração é a régua que ele não define. Quem trabalha só nas
		 * próprias vagas não precisa de nenhum dos dois — e o pedido do cliente
		 * era privacidade entre analistas, não só entre vagas.
		 */
		'analytics:read',
		'talent:read',
		'ai:use',
	],
	/** Legado: o que existia antes de haver escopo. Vê a empresa inteira. */
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

/**
 * ALCANCE do papel sobre as vagas — a segunda dimensão da autorização.
 *
 * Capability responde "pode?"; escopo responde "em quais?". Sem separar as
 * duas, "recrutador" só poderia ser expresso tirando verbos dele — e aí ele
 * perderia ações que precisa ter na PRÓPRIA vaga.
 *
 * `own` = só as vagas que a pessoa criou. Vale para tudo que pendura na vaga:
 * candidatos, quadro, painéis, busca e avisos. Uma vaga que a pessoa não
 * alcança não pode aparecer por nenhuma porta — senão a privacidade é
 * decoração.
 */
export type JobScope = 'all' | 'own'

export function jobScopeOf(role: TenantRole): JobScope {
	return role === 'recruiter' ? 'own' : 'all'
}
