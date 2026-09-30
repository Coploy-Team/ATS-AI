import type { FastifyInstance } from 'fastify'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo registra as rotas da REDE do candidato —
 * vitrine, projetos e perfil aberto — que só a área do candidato consome. Essa
 * área é da Coploy hospedada e não faz parte desta distribuição: os arquivos
 * `routes/showcase/` e os serviços correspondentes não existem nesta árvore,
 * e o build do clone é a prova (importar algo deles quebra a compilação,
 * nunca falha em silêncio).
 *
 * O perfil do candidato, a entrevista de perfil e `/interviews/mine` ficam:
 * são o que o MCP (aberto) consome numa instalação própria.
 */
export function registerCandidateNetworkRoutes(_app: FastifyInstance) {
	// distribuição open: nenhuma rota da rede do candidato a registrar
}
