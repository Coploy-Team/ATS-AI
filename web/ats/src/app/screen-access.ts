/**
 * Quem alcança cada TELA — em um lugar só.
 *
 * O menu escondia algumas coisas, a rota guardava outras, e o resto não
 * guardava nada: dava para chegar em Créditos, E-mails e Integrações por URL
 * (ou por um "Ver vaga" numa lista) e receber a tela quebrada, com o erro cru
 * da API. Sumir do menu e deixar a porta aberta é a mesma falha do RBAC antigo.
 *
 * A capability aqui é a MESMA que o servidor exige na rota correspondente — a
 * tela não inventa regra, ela antecipa a resposta. Quando as duas divergirem, é
 * esta tabela que está errada.
 */
export const ACESSO_POR_TELA: Record<string, { capability?: string; feature?: string }> = {
	'/comunicacao': { capability: 'settings:write' },
	/* endereço antigo de Comunicação; a rota redireciona, a régua acompanha */
	'/emails': { capability: 'settings:write' },
	'/estrutura': { capability: 'settings:write' },
	/* campos próprios saíram de Estrutura e trouxeram a mesma régua */
	'/formularios': { capability: 'settings:write' },
	/* relatório é leitura de dado agregado da empresa inteira */
	'/relatorios': { capability: 'analytics:read' },
	'/configuracoes': { capability: 'settings:read' },
	'/integracoes': { capability: 'integration:read', feature: 'integrations' },
	'/creditos': { capability: 'billing:read', feature: 'billing' },
	'/servidor': { capability: 'settings:write', feature: 'instanceConfig' },
	'/time': { capability: 'team:read' },
	'/hunting': { feature: 'hunting', capability: 'talent:read' },
	/*
	 * Requisição é aprovação de headcount — orçamento, não vaga. A tela já
	 * exigia `settings:write` para aprovar; entrar nela pede o mesmo.
	 */
	/* a cara pública da empresa e como o processo dela se comporta */
	'/portal-de-vagas': { capability: 'settings:write' },
	'/processo-seletivo': { capability: 'settings:write' },
	/* aprovar pedido é decidir orçamento — headcount é dinheiro */
	'/pedidos-de-vaga': { capability: 'settings:write' },
}
