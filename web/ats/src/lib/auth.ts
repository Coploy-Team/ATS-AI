import type { AuthClient } from '@coploy/auth-client'

/**
 * Esta distribuição autentica por BetterAuth, contra a própria API.
 *
 * Não há provedor alternativo: a edição hospedada da Coploy usa outro, e a
 * configuração dele identifica o projeto dela — não funcionaria aqui nem
 * faria sentido tentar.
 */
let client: AuthClient | null = null

export async function initAuthClient(): Promise<AuthClient> {
	if (client) return client

	const { createBetterAuthClient } = await import('@coploy/auth-client/betterauth')
	client = createBetterAuthClient({ baseURL: import.meta.env.VITE_BETTERAUTH_URL })

	await client.initialize()
	return client
}

/** Válido só depois do initAuthClient() do boot (main.tsx aguarda). */
export function getAuth(): AuthClient {
	if (!client) throw new Error('AuthClient não inicializado — initAuthClient() roda no boot.')
	return client
}
