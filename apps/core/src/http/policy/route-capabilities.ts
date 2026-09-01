import type { Capability } from '@coploy/domain'

/**
 * A política de autorização, inteira, num lugar só.
 *
 * ## Por que tabela e não decorator por rota
 *
 * A primeira leva de RBAC (V2-301) protegeu 22 registros embrulhando cada rota
 * com `requireCapability(...)`. Funciona, mas espalha uma política de segurança
 * por 60 arquivos: ninguém consegue responder "o que um `shared` pode fazer?"
 * sem `grep`. Uma matriz de permissões precisa ser LIDA de cima a baixo, e isso
 * pede uma tabela.
 *
 * A tabela também é o que torna a cobertura verificável: `check:rbac-coverage`
 * cruza esta tabela com as rotas `x-surface: empresa` do contrato e falha
 * quando alguma fica de fora. É o mesmo desenho fail-closed do ADR-003 — rota
 * nova nasce obrigada a responder "que capability é essa?", só que a resposta
 * mora aqui em vez de no arquivo da rota.
 *
 * ## Chave
 *
 * `"MÉTODO /caminho/no/formato/{openapi}"` — a mesma forma do contrato público,
 * porque é contra ele que a cobertura é conferida. Em tempo de request o
 * caminho do Fastify (`/companies/jobs/:jobId`) é convertido para esta forma.
 */
export const ROUTE_CAPABILITIES: Record<string, Capability> = {
	// ── Identidade e contexto do próprio usuário ───────────────────────────
	// Nada aqui expõe dado de outra pessoa: é quem sou eu e o que posso.
	'GET /profile': 'tenant:member',
	'PATCH /profile': 'tenant:member',
	/*
	 * Trocar a PRÓPRIA senha é de qualquer membro, não de administrador: exigir
	 * papel alto obrigaria um editor a pedir ao dono da conta para poder trocar
	 * a senha dele mesmo. A prova de identidade é a senha atual, que o service
	 * confere, e não o nível de acesso.
	 */
	'POST /auth/change-password': 'tenant:member',
	'GET /companies/capabilities': 'tenant:member',
	'GET /companies/membership': 'tenant:member',
	'GET /companies/user/{userId}': 'tenant:member',
	'GET /storage/download-url': 'tenant:member',
	'GET /taxonomy/occupations/resolve': 'tenant:member',
	'GET /taxonomy/skills': 'tenant:member',

	// Notificações são do usuário, não da empresa — todo membro lê e marca as
	// suas. O tenant já é conferido dentro da rota (params vs membership).
	'GET /companies/{companyId}/notifications': 'tenant:member',
	'POST /companies/{companyId}/notifications': 'tenant:member',
	'PATCH /companies/{companyId}/notifications/read-all': 'tenant:member',
	'PATCH /companies/{companyId}/notifications/{notificationId}': 'tenant:member',
	'PUT /companies/{companyId}/notifications/{notificationId}': 'tenant:member',
	'DELETE /companies/{companyId}/notifications/{notificationId}': 'tenant:member',

	// Mensagens automáticas são CONFIGURAÇÃO da empresa (o que o candidato
	// recebe), não a caixa de entrada de alguém.
	'GET /companies/{companyId}/notifications/messages': 'settings:read',
	'GET /companies/{companyId}/notifications/messages/{messageId}': 'settings:read',
	'POST /companies/{companyId}/notifications/messages': 'settings:write',
	'PUT /companies/{companyId}/notifications/messages/{messageId}': 'settings:write',
	'PATCH /companies/{companyId}/notifications/messages/{messageId}': 'settings:write',
	'DELETE /companies/{companyId}/notifications/messages/{messageId}': 'settings:write',

	// ── Empresa e configurações ────────────────────────────────────────────
	/*
	 * LER a própria empresa é de qualquer membro, não de quem administra.
	 *
	 * Estava como `settings:read` e nunca doeu porque todos os papéis tinham
	 * essa capability. Quando o recrutador deixou de ter, a rota passou a
	 * responder 403 — e ela é o "que empresa é esta": nome, logo e PLANO. Sem
	 * ela o cliente caía em `free` e a tela inteira se vestia de SaaS.
	 *
	 * A regra que ficou clara: o que a pessoa precisa para trabalhar não pode
	 * estar atrás da capability de configurar.
	 */
	'GET /companies': 'tenant:member',
	'PUT /companies': 'settings:write',
	'PATCH /companies': 'settings:write',
	'POST /companies/logo': 'settings:write',
	/* campos próprios aparecem no FORMULÁRIO de vaga — quem cria vaga precisa ler */
	'GET /companies/custom-fields': 'job:read',
	'POST /companies/custom-fields': 'settings:write',
	'GET /companies/email-templates': 'settings:read',
	'PUT /companies/email-templates/{kind}': 'settings:write',
	'DELETE /companies/email-templates/{kind}': 'settings:write',
	/* prever é leitura: quem só consulta a configuração pode ver o e-mail */
	'POST /companies/email-templates/{kind}/preview': 'settings:read',
	/*
	 * Estas três são a RÉGUA em uso, não a tela que a define: os motivos que o
	 * recrutador escolhe ao reprovar, as colunas do quadro dele e as ações da
	 * etapa que dispara quando ele move alguém. Quem reprova e move precisa
	 * lê-las; quem as MUDA é que precisa de `settings:write` (abaixo).
	 */
	'GET /companies/rejection-reasons': 'candidate:read',
	'GET /companies/kanban-columns': 'job:read',
	'GET /companies/stage-actions': 'candidate:read',
	/* configurar disparo automático de e-mail é decisão de operação, não de vaga */
	'PUT /companies/stage-actions': 'settings:write',
	'POST /companies/kanban-columns': 'settings:write',
	'PATCH /companies/kanban-columns/{columnId}': 'settings:write',
	'DELETE /companies/kanban-columns/{columnId}': 'settings:write',
	/* unidade da empresa também é campo do formulário de vaga */
	'GET /companies/org-units': 'job:read',
	'POST /companies/org-units': 'settings:write',
	'PATCH /companies/org-units/{id}': 'settings:write',
	'PATCH /companies/custom-fields/{id}': 'settings:write',
	'GET /settings/privacy/retention': 'settings:read',
	// Servidor (open): o handler ainda exige DONO + selfhosted — a capability
	// aqui é o piso, não o teto (editor nem vê o menu).
	'GET /settings/instance/email': 'settings:read',
	'PUT /settings/instance/email': 'settings:write',
	'POST /settings/instance/email/test': 'settings:write',
	// licença do plugin Motor  — o gate REAL é dono+selfhosted na rota
	'GET /settings/instance/plugin': 'settings:read',
	'PUT /settings/instance/plugin': 'settings:write',
	'PATCH /settings/privacy/retention': 'settings:write',
	/*
	 * Anonimização é irreversível e apaga dado de pessoa real. Fica em
	 * `settings:write` — o mesmo nível de quem muda a política de retenção — e
	 * nunca em `candidate:*`, que todo recrutador tem.
	 */
	'POST /settings/privacy/anonymize': 'settings:write',

	// ── Time ───────────────────────────────────────────────────────────────
	'GET /companies/collaborators': 'team:read',
	'GET /companies/creators': 'team:read',
	'POST /companies/collaborators': 'team:write',
	'PUT /companies/collaborators/{id}': 'team:write',
	'DELETE /companies/collaborators/{id}': 'team:write',

	// ── Vagas ──────────────────────────────────────────────────────────────
	'GET /companies/jobs': 'job:read',
	'GET /companies/jobs/count': 'job:read',
	'GET /companies/jobs/interviews/count': 'job:read',
	'GET /companies/jobs/{slug}': 'job:read',
	'GET /companies/jobs/{jobId}/kanban-config': 'job:read',
	'GET /companies/jobs/{jobId}/knockout': 'job:read',
	'GET /companies/jobs/{jobId}/ranking': 'job:read',
	'GET /companies/requisitions': 'job:read',
	'GET /companies/info-jobs': 'job:read',
	'GET /job-portal': 'job:read',
	'POST /companies/jobs': 'job:write',
	'PUT /companies/jobs/{jobId}': 'job:write',
	'PATCH /companies/jobs/{jobId}': 'job:write',
	'PUT /companies/jobs/{jobId}/kanban-config': 'job:write',
	'PUT /companies/jobs/{jobId}/knockout': 'job:write',
	'POST /companies/requisitions': 'job:write',
	'PATCH /companies/requisitions/{requisitionId}': 'job:write',
	'POST /companies/info-jobs': 'job:write',
	'PUT /companies/info-jobs/{infoJobsId}': 'job:write',
	'PATCH /companies/info-jobs/{infoJobsId}': 'job:write',
	'DELETE /companies/info-jobs/{infoJobsId}': 'job:write',
	'POST /job-portal': 'job:write',
	'PUT /job-portal': 'job:write',
	'POST /job-portal/media': 'job:write',
	'POST /settings/import/preview': 'job:write',
	'POST /settings/import/commit': 'job:write',
	/*
	 * Upload é `tenant:member`: além de mídia de vaga, é por aqui que qualquer
	 * pessoa troca a própria foto. O que a rota devolve é uma URL — o controle
	 * de quem pode USAR essa URL está em quem grava o campo, não aqui.
	 */
	'POST /upload/file': 'tenant:member',
	'POST /storage/presigned-upload': 'job:write',
	'DELETE /companies/jobs/{jobId}': 'job:delete',

	// ── Candidatos ─────────────────────────────────────────────────────────
	'GET /companies/interviews': 'candidate:read',
	'GET /companies/candidates/ranking': 'candidate:read',
	'GET /companies/candidates/count': 'candidate:read',
	'GET /companies/candidates/approved/count': 'candidate:read',
	'GET /companies/jobs/{jobId}/candidates': 'candidate:read',
	'GET /companies/jobs/{jobId}/candidates/{candidateId}/dossier': 'candidate:read',
	'GET /companies/jobs/{jobId}/candidates/{candidateId}/timeline': 'candidate:read',
	'GET /companies/jobs/{jobId}/candidates/{candidateId}/scorecards': 'candidate:read',
	'GET /companies/jobs/{jobId}/candidates/{candidateId}/offers': 'candidate:read',
	'GET /users/{userId}/jobs-applied/{jobAppliedId}': 'candidate:read',
	'GET /companies/interviews/{userId}/{jobAppliedId}/translation/{language}': 'candidate:read',
	'GET /companies/interviews/{userId}/{jobAppliedId}/questions/{questionId}/captions/{language}':
		'candidate:read',
	'GET /companies/rejection-review-requests/pending': 'candidate:read',
	'PATCH /companies/interviews/{id}': 'candidate:move',
	'PATCH /companies/interviews/bulk-status': 'candidate:move',
	'POST /companies/jobs/{jobId}/candidates/batch': 'candidate:move',
	'POST /companies/jobs/{jobId}/reengage': 'candidate:move',
	'POST /companies/jobs/{jobId}/invite-interview': 'candidate:move',
	'POST /companies/jobs/{jobId}/candidates/{candidateId}/request-profile': 'candidate:move',
	/*
	 * Avaliar e comentar ficam em `candidate:read`, não em `candidate:move`, e
	 * isso é deliberado: é o que o convidado de revisão (`shared`) foi feito
	 * para fazer. Ele opina; quem MOVE a pessoa no processo é a empresa. Era a
	 * escolha das rotas antes desta tabela e continua sendo.
	 */
	'POST /companies/jobs/{jobId}/candidates/{candidateId}/timeline/comments': 'candidate:read',
	'PUT /companies/jobs/{jobId}/candidates/{candidateId}/scorecards': 'candidate:read',
	'POST /candidates/{userId}/{jobAppliedId}/like/{action}': 'candidate:move',
	'PATCH /companies/rejection-review-requests/{requestId}': 'candidate:reject',
	/*
	 * Destravar candidato e acelerar análise CONSOMEM crédito, e por isso ficam
	 * em `candidate:unlock` — que `shared` não tem. Um convidado de revisão não
	 * pode gastar o saldo de quem o convidou.
	 */
	'POST /companies/interviews/{userId}/{jobAppliedId}/fast-track': 'candidate:unlock',
	'POST /companies/interviews/{id}/ai-detection': 'candidate:unlock',
	'POST /companies/interviews/{userId}/{jobAppliedId}/authenticity-analysis': 'candidate:unlock',
	'POST /interviews/{interviewId}/abandonment': 'candidate:move',

	// ── Ofertas e compartilhamento ─────────────────────────────────────────
	'POST /companies/jobs/{jobId}/candidates/{candidateId}/offers': 'job:write',
	'PATCH /companies/offers/{offerId}': 'job:write',
	'POST /companies/offers/{offerId}/send': 'job:write',
	'POST /companies/jobs/{jobId}/hm-review-tokens': 'candidate:read',
	'POST /companies/jobs/{jobId}/share-links': 'candidate:read',
	'GET /companies/share-links/{code}/candidates': 'candidate:read',
	'GET /companies/share-links/{code}/candidates/{userId}': 'candidate:read',

	// ── Banco de talentos (hunting) ────────────────────────────────────────
	/* traduzir pedido em filtro é parte de buscar talento — e gasta crédito de IA */
	'POST /companies/hunting/intent': 'ai:use',
	'GET /public_interviews': 'talent:read',
	'GET /public_interviews/summary': 'talent:read',
	'GET /public_interviews/user/{userId}': 'talent:read',

	// ── Painéis e relatórios ───────────────────────────────────────────────
	'GET /dashboard/home': 'analytics:read',
	'POST /dashboard/inbox': 'analytics:read',
	'POST /dashboard/insights': 'analytics:read',
	'POST /dashboard/funnel-breakdown': 'analytics:read',
	'POST /dashboard/source-breakdown': 'analytics:read',
	'POST /dashboard/score-distribution': 'analytics:read',
	'POST /dashboard/interviews-by-job': 'analytics:read',
	'POST /dashboard/interviews-by-time': 'analytics:read',
	'POST /dashboard/jobs-performance': 'analytics:read',
	'GET /feedback/nps': 'analytics:read',
	'POST /feedback/nps': 'tenant:member',
	'GET /feedback/nps/export': 'analytics:read',
	'POST /generate-excel-report': 'analytics:read',
	'POST /generate-excel-report-by-year': 'analytics:read',
	'GET /get-excel-report/{uidTemporario}': 'analytics:read',

	// ── Geração por IA (gasta crédito) ─────────────────────────────────────
	'POST /ia/job-description': 'ai:use',
	'POST /ia/generate-job-post-description': 'ai:use',
	'POST /ia/questions': 'ai:use',
	'POST /ia/evaluation-questions': 'ai:use',
	'POST /ia/screening-description': 'ai:use',
	'POST /ia/screening-questions': 'ai:use',
	'POST /ia/skill-description': 'ai:use',

	// ── Cobrança ───────────────────────────────────────────────────────────

	// ── Integrações ────────────────────────────────────────────────────────
	'GET /settings/integrations/webhooks': 'integration:read',
	'GET /settings/integrations/webhooks/{id}': 'integration:read',
	'GET /settings/integrations/webhooks/events': 'integration:read',
	'GET /settings/integrations/webhooks/logs': 'integration:read',
	'POST /settings/integrations/webhooks': 'integration:write',
	'PUT /settings/integrations/webhooks/{id}': 'integration:write',
	'DELETE /settings/integrations/webhooks/{id}': 'integration:write',
	'POST /settings/integrations/webhooks/test': 'integration:write',
	'POST /settings/integrations/webhooks/logs/{logId}/retry': 'integration:write',
}

/** `/companies/jobs/:jobId` → `/companies/jobs/{jobId}` (a forma do contrato). */
export function toContractPath(fastifyUrl: string): string {
	return fastifyUrl.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

export function capabilityFor(method: string, fastifyUrl: string): Capability | undefined {
	return ROUTE_CAPABILITIES[`${method.toUpperCase()} ${toContractPath(fastifyUrl)}`]
}
