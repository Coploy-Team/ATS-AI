import type { InfraProvider } from '@coploy/infra'

import { env } from '@/env'

const CUSTOM_TOKEN_EXCHANGE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken'

export interface RegisterCandidateParams {
	name: string
	email: string
	password: string
	language?: string
}

/**
 * Autenticação de candidato pro fluxo OAuth do MCP. Espelha a semântica das
 * rotas do core (`/auth/create`, `/sessions/password`) e o mint de ID token do
 * whatsapp-interview — mesmo doc Firestore, mesmos caminhos BetterAuth/Firebase.
 */
/** O documento de candidato, no padrão que o core grava em `/auth/create`. */
function candidateDoc(params: { name: string; email: string; language: string }) {
	return {
		display_name: params.name,
		email: params.email,
		phone_number: '',
		photo_url: getDiceBearUrl(params.name || params.email),
		occupation: '',
		level: '',
		language: params.language,
		created_time: new Date(),
	}
}

export function createCandidateAuthService(infra: InfraProvider) {
	/**
	 * Garante que a conta EXISTE como candidata antes de o assistente agir por ela.
	 *
	 * ⚠️ Cadastrar criava o documento; ENTRAR não criava nada — e o Firebase Auth é
	 * compartilhado entre quem usa a Coploy como empresa e quem a usa como
	 * candidato. Quem já tinha conta (um recrutador, alguém cadastrado antes desta
	 * feature) entrava pelo assistente e virava um candidato fantasma: o currículo
	 * ia para `candidateProfiles`, o espelho para `users/{uid}` falhava porque o
	 * documento não existia, e `GET /dream-jobs/interview` respondia
	 * "Usuário não encontrado". O assistente lia a completude do lugar CERTO e
	 * dizia, com razão, que o perfil estava completo — mas nenhuma tela o mostrava.
	 *
	 * Idempotente de propósito: roda a cada login e não toca em quem já existe.
	 * Falhar aqui derruba o login, e isso é deliberado — seguir para um estado
	 * partido é o que produziu o defeito.
	 */
	async function ensureCandidateDoc(uid: string, email: string): Promise<void> {
		const existing = await infra.userRepository.getUser(uid).catch(() => null)
		if (existing) return

		const authUser = await infra.auth.getUserByEmail(email).catch(() => null)
		const name = authUser?.displayName || email.split('@')[0]
		const doc = candidateDoc({ name, email, language: 'pt-BR' })

		/*
		 * Quem já tem currículo entra com ele preenchido — o documento não nasce
		 * em branco.
		 *
		 * Sem isto o conserto ficaria pela metade: o documento passaria a existir,
		 * mas com `occupation` vazio, e o hunting só voltaria a enxergar a pessoa
		 * quando ela editasse o perfil de novo. Como o currículo é gravado ANTES
		 * (é o que acontece hoje com quem está no estado partido), semear daqui é
		 * o que faz a base existente se curar sozinha no próximo login, sem
		 * ninguém escrever em produção na mão.
		 *
		 * Só os campos que o espelho leva — o currículo inteiro inflaria um
		 * documento lido em toda a plataforma só para pegar nome e foto.
		 */
		const perfil = await infra.userRepository.getCandidateProfile(uid).catch(() => null)
		const espelho = {
			/*
			 * ⚠️ O telefone entra AQUI e não pode ficar vazio. A identidade é
			 * resolvida como `users.phone_number ?? perfil.phone`, e string vazia
			 * NÃO é nulo — o `phone_number: ''` do molde venceria o telefone real e
			 * o apagaria da tela sem apagá-lo do banco.
			 */
			...(perfil?.phone ? { phone_number: perfil.phone } : {}),
			...(perfil?.occupation ? { occupation: perfil.occupation } : {}),
			...(perfil?.level ? { level: perfil.level } : {}),
			...(perfil?.countryOfResidence
				? { countryOfResidence: perfil.countryOfResidence }
				: {}),
			...(perfil?.countriesOfInterest
				? { countriesOfInterest: perfil.countriesOfInterest }
				: {}),
		}

		await infra.userRepository.createUser({ uuid: uid, ...doc, ...espelho }, uid)
	}

	return {
		/** Retorna o uid em caso de sucesso; null pra credencial inválida. */
		async loginWithPassword(email: string, password: string): Promise<string | null> {
			try {
				await infra.auth.signInWithPassword(email, password)
			} catch {
				return null
			}
			const authUser = await infra.auth.getUserByEmail(email).catch(() => null)
			if (!authUser?.uid) return null
			await ensureCandidateDoc(authUser.uid, email)
			return authUser.uid
		},

		async emailExists(email: string): Promise<boolean> {
			const authUser = await infra.auth.getUserByEmail(email).catch(() => null)
			return authUser != null
		},

		/** Cria conta candidata (Auth + doc Firestore no padrão do core) e retorna o uid. */
		async registerCandidate(params: RegisterCandidateParams): Promise<string> {
			const { name, email, password } = params
			const language = params.language ?? 'pt-BR'
			/* mesmo molde do login: duas cópias divergiriam no primeiro campo novo */
			const doc = candidateDoc({ name, email, language })

			// Selfhosted (BetterAuth)
			if (infra.auth.createUserAndGetToken) {
				const result = await infra.auth.createUserAndGetToken({
					email,
					password,
					displayName: name,
				})
				await infra.userRepository.createUser({ uuid: result.uid, ...doc }, result.uid)
				return result.uid
			}

			// GCP (Firebase)
			const authUser = await infra.auth.createUser({ email, password, displayName: name })
			await infra.userRepository.createUser({ uuid: authUser.uid, ...doc }, authUser.uid)
			return authUser.uid
		},

		/**
		 * Minta um ID token Firebase pro uid (custom token + exchange no Identity
		 * Toolkit). É esse token que o orchestrator aceita no Bearer. Selfhosted:
		 * o custom token já é o token utilizável (padrão whatsapp-interview).
		 */
		async mintUserIdToken(uid: string): Promise<string> {
			const customToken = await infra.auth.createCustomToken(uid)
			const apiKey = env.FIREBASE_API_KEY
			if (!apiKey) return customToken

			const response = await fetch(`${CUSTOM_TOKEN_EXCHANGE_URL}?key=${apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: customToken, returnSecureToken: true }),
			})
			if (!response.ok) {
				throw new Error(`Custom token exchange failed: ${await response.text()}`)
			}
			const data = (await response.json()) as { idToken: string }
			return data.idToken
		},

		async getUserLanguage(uid: string): Promise<string | null> {
			const user = await infra.userRepository.getUser(uid).catch(() => null)
			return (user as { language?: string | null } | null)?.language ?? null
		},

		/** Dados básicos da conta — usados pra completar o perfil na criação. */
		async getUserAccount(uid: string): Promise<{ displayName: string | null; email: string | null } | null> {
			const user = (await infra.userRepository.getUser(uid).catch(() => null)) as {
				display_name?: string | null
				email?: string | null
			} | null
			if (!user) return null
			return { displayName: user.display_name ?? null, email: user.email ?? null }
		},
	}
}

export type CandidateAuthService = ReturnType<typeof createCandidateAuthService>

function getDiceBearUrl(seed: string): string {
	return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`
}
