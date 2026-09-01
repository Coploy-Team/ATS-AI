/**
 * @coploy/sdk — cliente fetch tipado da Coploy Public API, gerado do
 * contrato público . Framework-agnostic; hooks React em
 * `@coploy/sdk/react`.
 *
 * Uso:
 *   configureCoploySdk({ baseUrl, getToken })
 *   const jobs = await empresa.getCompaniesJobs({ ... })
 */
export {
	configureCoploySdk,
	CoployApiError,
	coployFetch,
	type CoploySdkConfig,
} from './runtime/http'

export * as empresa from './generated/empresa'
export * as candidato from './generated/candidato'
export * as publico from './generated/publico'
export * as integracoes from './generated/integracoes'
