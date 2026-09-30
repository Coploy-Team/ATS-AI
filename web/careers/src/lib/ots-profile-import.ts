import { candidato } from '@coploy/sdk'

/**
 * Import do Profile portátil OTS — a trajetória do candidato vem do provedor
 * de origem (ex.: rede Coploy) em vez de ser redigitada.
 *
 * O fluxo é OAuth 2.1 de cliente PÚBLICO, inteiro no browser: descoberta
 * (RFC 8414) → registro dinâmico (RFC 7591) → authorization code + PKCE →
 * `GET /ots/v0.1/profile` com o token do TALENTO → `PATCH /dream-jobs/profile`
 * local, que já faz o merge defensivo (fonte nova não apaga o que existe).
 *
 * Por que sem servidor no meio: o Profile não é prova — é declaração, com o
 * mesmo nível de confiança de digitar. O OAuth aqui é UX (um clique no lugar
 * de redigitar), não verificação; o token do provedor de origem nunca toca o
 * nosso backend.
 */

const STORAGE_KEY = 'coploy.ots-profile-import'

interface PendingImport {
	state: string
	verifier: string
	clientId: string
	tokenEndpoint: string
	provider: string
	returnTo: string
}

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

function randomToken(bytes: number): string {
	const buffer = new Uint8Array(bytes)
	crypto.getRandomValues(buffer)
	return base64url(buffer)
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
	return base64url(new Uint8Array(digest))
}

function callbackUrl(): string {
	return `${window.location.origin}/importar-perfil`
}

/**
 * Passo 1 — descobre, registra e REDIRECIONA pro provedor. A página morre
 * aqui; o resto acontece no callback.
 */
export async function startProfileImport(provider: string, returnTo: string): Promise<void> {
	const base = provider.replace(/\/$/, '')
	const metadataResponse = await fetch(`${base}/.well-known/oauth-authorization-server`)
	if (!metadataResponse.ok) throw new Error('discovery_failed')
	const metadata = (await metadataResponse.json()) as {
		authorization_endpoint?: string
		token_endpoint?: string
		registration_endpoint?: string
	}
	if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.registration_endpoint) {
		throw new Error('discovery_failed')
	}

	const registration = await fetch(metadata.registration_endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Portal de vagas (import de perfil OTS)',
			redirect_uris: [callbackUrl()],
			grant_types: ['authorization_code'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
		}),
	})
	if (!registration.ok) throw new Error('registration_failed')
	const { client_id: clientId } = (await registration.json()) as { client_id: string }

	const state = randomToken(16)
	const verifier = randomToken(48)
	const pending: PendingImport = {
		state,
		verifier,
		clientId,
		tokenEndpoint: metadata.token_endpoint,
		provider: base,
		returnTo,
	}
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending))

	const authorize = new URL(metadata.authorization_endpoint)
	authorize.searchParams.set('response_type', 'code')
	authorize.searchParams.set('client_id', clientId)
	authorize.searchParams.set('redirect_uri', callbackUrl())
	authorize.searchParams.set('state', state)
	authorize.searchParams.set('code_challenge', await sha256(verifier))
	authorize.searchParams.set('code_challenge_method', 'S256')
	window.location.assign(authorize.toString())
}

/** Campos do Profile OTS que o nosso PATCH aceita — allowlist explícita. */
const PROFICIENCIES = new Set(['basic', 'intermediate', 'advanced', 'fluent', 'native'])

function toPatchBody(profile: Record<string, unknown>): Record<string, unknown> {
	const pick = (key: string) => {
		const value = profile[key]
		return value === null || value === undefined || value === '' ? undefined : value
	}
	const list = (key: string) => {
		const value = profile[key]
		return Array.isArray(value) && value.length > 0 ? value : undefined
	}
	const languages = (list('languages') as Array<Record<string, unknown>> | undefined)?.map(
		(item) => ({
			language: item.language,
			// proficiência fora do nosso vocabulário é descartada, não rejeitada:
			// provedor estrangeiro pode usar outra escala e o idioma ainda vale
			...(typeof item.proficiency === 'string' && PROFICIENCIES.has(item.proficiency)
				? { proficiency: item.proficiency }
				: {}),
		}),
	)
	const body: Record<string, unknown> = {
		headline: pick('headline'),
		summary: pick('summary'),
		occupation: pick('occupation'),
		level: pick('level'),
		yearsOfExperience: pick('yearsOfExperience'),
		professionalObjectives: pick('professionalObjectives'),
		company: pick('company'),
		location: pick('location'),
		countryOfResidence: pick('countryOfResidence'),
		countriesOfInterest: list('countriesOfInterest'),
		skills: list('skills'),
		experiences: list('experiences'),
		education: list('education'),
		languages,
		certifications: list('certifications'),
		linkedinUrl: pick('linkedinUrl'),
	}
	for (const key of Object.keys(body)) {
		if (body[key] === undefined) delete body[key]
	}
	return body
}

export interface ImportOutcome {
	returnTo: string
	imported: boolean
	/** Quantos campos vieram preenchidos — é o número que a tela conta. */
	fieldCount: number
}

/**
 * Passo 2 — no callback: troca o code (PKCE), busca o Profile no provedor e
 * grava no perfil LOCAL pela porta única de escrita (merge defensivo).
 */
export async function completeProfileImport(code: string, state: string): Promise<ImportOutcome> {
	const raw = sessionStorage.getItem(STORAGE_KEY)
	sessionStorage.removeItem(STORAGE_KEY)
	if (!raw) throw new Error('no_pending_import')
	const pending = JSON.parse(raw) as PendingImport
	if (pending.state !== state) throw new Error('state_mismatch')

	const tokenResponse = await fetch(pending.tokenEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: callbackUrl(),
			client_id: pending.clientId,
			code_verifier: pending.verifier,
		}),
	})
	if (!tokenResponse.ok) throw new Error('token_exchange_failed')
	const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string }

	const profileResponse = await fetch(`${pending.provider}/ots/v0.1/profile`, {
		headers: { authorization: `Bearer ${accessToken}` },
	})
	if (!profileResponse.ok) throw new Error('profile_fetch_failed')
	const profile = (await profileResponse.json()) as Record<string, unknown>

	const body = toPatchBody(profile)
	if (Object.keys(body).length === 0) {
		return { returnTo: pending.returnTo, imported: false, fieldCount: 0 }
	}

	const saved = await candidato.patchDreamJobsProfile(body as never)
	if (saved.status !== 200) throw new Error('local_save_failed')

	return { returnTo: pending.returnTo, imported: true, fieldCount: Object.keys(body).length }
}
