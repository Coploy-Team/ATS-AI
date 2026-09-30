/**
 * Runtime HTTP do @coploy/sdk — a única peça escrita à mão do pacote.
 *
 * Todo o código gerado (Orval) delega a `coployFetch`, que resolve baseUrl,
 * injeta credencial (Bearer da sessão OU x-api-key de integração) e normaliza
 * erro. A configuração é module-level (`configureCoploySdk`) — limitação
 * conhecida do v0.1: um app = uma configuração. Cliente instanciável entra
 * numa minor futura sem breaking (a assinatura do mutator não muda).
 */

export interface CoploySdkConfig {
	/** Ex.: https://api-hml.coploy.io/core (sem barra final). */
	baseUrl: string
	/**
	 * Provider assíncrono do token de sessão (Firebase ID token / BetterAuth).
	 * Chamado a cada request — quem renova o token é o app, não o SDK.
	 */
	getToken?: () => Promise<string | null> | string | null
	/** API key de empresa — superfície `integracoes`. Ignorada se `getToken` retornar token. */
	apiKey?: string
	/** Override de fetch (testes, ambientes sem global fetch). */
	fetch?: typeof globalThis.fetch
}

let config: CoploySdkConfig | null = null

export function configureCoploySdk(next: CoploySdkConfig): void {
	config = { ...next, baseUrl: next.baseUrl.replace(/\/+$/, '') }
}

/** Visível para testes; consumidores não devem precisar disto. */
export function getCoploySdkConfig(): CoploySdkConfig | null {
	return config
}

export class CoployApiError extends Error {
	readonly status: number
	readonly body: unknown

	constructor(status: number, body: unknown, url: string) {
		const detail =
			body && typeof body === 'object' && 'message' in body
				? String((body as { message: unknown }).message)
				: `HTTP ${status}`
		super(`Coploy API error ${status} em ${url}: ${detail}`)
		this.name = 'CoployApiError'
		this.status = status
		this.body = body
	}
}

/**
 * Mutator do Orval: `coployFetch<T>(url, init)`.
 *
 * Contrato de retorno: o código gerado tipa a resposta como o ENVELOPE
 * `{ data, status, headers }` — este mutator o materializa. Erro HTTP nunca
 * retorna envelope: vira `CoployApiError` (o union de erro dos tipos gerados
 * documenta os shapes; o fluxo de exceção é único).
 *
 * ⚠️ `new URL(path, base)` descartaria o path prefix da base (gotcha real do
 * LB `/core`) — por isso concatenação.
 */
export async function coployFetch<T>(url: string, init: RequestInit): Promise<T> {
	if (!config) {
		throw new Error(
			'@coploy/sdk não configurado — chame configureCoploySdk({ baseUrl, getToken }) no boot do app.',
		)
	}

	const headers = new Headers(init.headers)
	const token = config.getToken ? await config.getToken() : null
	if (token) {
		headers.set('authorization', `Bearer ${token}`)
	} else if (config.apiKey) {
		headers.set('x-api-key', config.apiKey)
	}
	/*
	 * Corpo que o navegador sabe descrever sozinho NÃO leva content-type nosso.
	 *
	 * `FormData` precisa do boundary (`multipart/form-data; boundary=...`), que
	 * só o fetch sabe gerar. Forçar `application/json` aqui apagava esse
	 * cabeçalho e o servidor recebia um multipart que não conseguia abrir —
	 * quebrando qualquer upload feito pelo SDK, em qualquer consumidor.
	 */
	const bodySpeaksForItself =
		typeof FormData !== 'undefined' && init.body instanceof FormData ||
		typeof Blob !== 'undefined' && init.body instanceof Blob ||
		typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams
	if (init.body !== undefined && !bodySpeaksForItself && !headers.has('content-type')) {
		headers.set('content-type', 'application/json')
	}

	const doFetch = config.fetch ?? globalThis.fetch
	const response = await doFetch(`${config.baseUrl}${url}`, { ...init, headers })

	const contentType = response.headers.get('content-type') ?? ''
	const payload: unknown = contentType.includes('application/json')
		? await response.json().catch(() => null)
		: await response.text()

	if (!response.ok) {
		throw new CoployApiError(response.status, payload, url)
	}

	return { data: payload, status: response.status, headers: response.headers } as T
}
