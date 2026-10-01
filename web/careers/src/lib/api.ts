import { configureCoploySdk } from '@coploy/sdk'

/**
 * Sessão do CANDIDATO — não existe recrutador nesta superfície.
 *
 * O portal é público; a conta só entra na hora de se candidatar, e o que ela
 * garante é o vínculo da candidatura com uma pessoa real (e, adiante, o
 * currículo portátil OTS dela). O token fica em localStorage porque candidatar
 * de novo amanhã não deve pedir a senha de novo — e o pior caso de um token
 * vazado aqui é uma candidatura indesejada, não um vazamento de dados: a
 * superfície `candidato` só enxerga o que é da própria pessoa.
 */
const SESSION_KEY = 'coploy.careers.session'

export interface CandidateSession {
	token: string
	refreshToken?: string
	uid: string
	name: string
	email: string
}

export function getSession(): CandidateSession | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY)
		return raw ? (JSON.parse(raw) as CandidateSession) : null
	} catch {
		return null
	}
}

export function saveSession(session: CandidateSession) {
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session))
	} catch {
		/* storage cheio/bloqueado: a sessão vive só até o refresh */
	}
}

export function clearSession() {
	try {
		localStorage.removeItem(SESSION_KEY)
	} catch {
		/* nada a limpar */
	}
}

export function configureApi() {
	configureCoploySdk({
		baseUrl: import.meta.env.VITE_API_CORE_URL,
		getToken: () => getSession()?.token ?? null,
	})
}
