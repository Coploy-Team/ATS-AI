/**
 * @coploy/sdk/react — hooks TanStack Query gerados sobre o mesmo runtime.
 * Requer peer @tanstack/react-query ^5. Query keys vêm do gerador — nunca
 * montar keys manualmente no app (elimina a classe de bug de invalidation).
 */
export { configureCoploySdk, CoployApiError, type CoploySdkConfig } from './runtime/http'

export * as empresa from './generated/react/empresa'
export * as candidato from './generated/react/candidato'
export * as publico from './generated/react/publico'
export * as integracoes from './generated/react/integracoes'
