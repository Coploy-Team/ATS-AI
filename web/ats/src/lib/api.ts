import { configureCoploySdk } from '@coploy/sdk'

import { getAuth } from './auth'

/**
 * Todo dado do ats passa pelo @coploy/sdk (ADR-004/005) — o cliente único é
 * configurado uma vez no boot; o token vem do auth client a cada request.
 * Gap de API = PR no contrato, nunca fetch por fora.
 */
export function configureApi() {
	configureCoploySdk({
		baseUrl: import.meta.env.VITE_API_CORE_URL,
		getToken: () => getAuth().getToken(),
	})
}
