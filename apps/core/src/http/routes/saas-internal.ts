import type { FastifyInstance } from 'fastify'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo registra o console administrativo
 * interno e os endpoints internos de infraestrutura — ferramenta de quem
 * OPERA o serviço hospedado, não do produto. Nada disso faz parte da
 * distribuição open: os diretórios `routes/admin/` e `routes/internal/` não
 * existem nesta árvore, e o build do clone é a prova (importar algo deles
 * quebra a compilação, nunca falha em silêncio).
 */
export function registerSaasInternalRoutes(_app: FastifyInstance) {
	// distribuição open: nenhuma rota interna a registrar
}
