import type { AuthClient } from '@coploy/auth-client'

/**
 * Auth dual (Firebase no GCP / BetterAuth no selfhosted) via
 * @coploy/auth-client — pacote de utilitário de browser, PERMITIDO no ats
 * (o banimento do ADR-002/005 mira acoplamento de domínio: domain/infra/
 * shared/firebase; decisão registrada em docs/decisions.md).
 */
const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER ?? 'firebase'

/**
 * Configuração do Firebase da Coploy, embutida como PADRÃO.
 *
 * Quem usa a API hospedada não tem como preencher isto: as contas vivem no
 * nosso projeto, então a configuração precisa ser a nossa — e não há de onde
 * um estranho tirá-la. Deixar oito variáveis vazias no `.env.example` era
 * pedir o impossível e garantir que ninguém conseguisse rodar.
 *
 * Publicar não expõe nada: a configuração web do Firebase IDENTIFICA o
 * projeto, não autoriza. Ela já vai no bundle de qualquer app web em Firebase
 * — inclusive no nosso, hoje: dá para lê-la abrindo o código-fonte de
 * dashboard.coploy.io. Quem autoriza são as regras de segurança e o backend, e
 * a credencial de servidor (`FIREBASE_PRIVATE_KEY`) vive no core, que é
 * fechado.
 *
 * Cada campo aceita override por env, para quem apontar o cliente para o
 * próprio backend com o próprio projeto.
 */
export const COPLOY_FIREBASE = {
	apiKey: 'AIzaSyCXLK-rWSZJWCFWrhlq4GQHJVlvdu11D8M',
	authDomain: 'coployf.firebaseapp.com',
	databaseURL: 'https://coployf-default-rtdb.firebaseio.com',
	projectId: 'coployf',
	storageBucket: 'coployf.appspot.com',
	messagingSenderId: '263259856313',
	appId: '1:346369967184:web:44f7c5700ece9cd9f0bd55',
	measurementId: 'G-KT0T85EJFE',
} as const

/**
 * A configuração EFETIVA — env quando existe, padrão quando não.
 *
 * Exposta porque a tela de cadastro precisa da `apiKey` para perguntar ao
 * Firebase qual é a política de senha do projeto. Repetir o merge lá abriria
 * espaço para as duas divergirem, e a divergência apareceria como uma tela
 * dizendo uma regra enquanto o servidor aplica outra — que foi o defeito.
 */
export const firebaseWebConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY || COPLOY_FIREBASE.apiKey,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || COPLOY_FIREBASE.authDomain,
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || COPLOY_FIREBASE.databaseURL,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || COPLOY_FIREBASE.projectId,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || COPLOY_FIREBASE.storageBucket,
	messagingSenderId:
		import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || COPLOY_FIREBASE.messagingSenderId,
	appId: import.meta.env.VITE_FIREBASE_APP_ID || COPLOY_FIREBASE.appId,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || COPLOY_FIREBASE.measurementId,
} as const

let client: AuthClient | null = null

export async function initAuthClient(): Promise<AuthClient> {
	if (client) return client

	if (AUTH_PROVIDER === 'betterauth') {
		const { createBetterAuthClient } = await import('@coploy/auth-client/betterauth')
		client = createBetterAuthClient({ baseURL: import.meta.env.VITE_BETTERAUTH_URL })
	} else {
		const { getApps, initializeApp } = await import('firebase/app')
		const { createFirebaseAuthClient } = await import('@coploy/auth-client/firebase')
		const existing = getApps()
		const app =
			existing.length > 0
				? existing[0]
				: initializeApp(firebaseWebConfig)
		/*
		 * Padrão embutido tem um risco próprio: variável faltando deixou de
		 * quebrar alto e passou a cair, em silêncio, no projeto de PRODUÇÃO. Um
		 * build de homologação com `.env` incompleto autenticaria contra as
		 * contas reais e ninguém perceberia. O aviso não impede — impedir
		 * quebraria quem legitimamente usa a API hospedada — mas deixa rastro no
		 * console de quem estiver apontando para outro lugar.
		 */
		const apontaParaHospedada = (import.meta.env.VITE_API_CORE_URL ?? '').includes(
			'api.coploy.io',
		)
		if (!import.meta.env.VITE_FIREBASE_API_KEY && !apontaParaHospedada) {
			console.warn(
				`[auth] Usando o Firebase de produção da Coploy (${COPLOY_FIREBASE.projectId}) ` +
					`com VITE_API_CORE_URL="${import.meta.env.VITE_API_CORE_URL}". ` +
					'Se este não é o ambiente que você quer, defina VITE_FIREBASE_* no .env.',
			)
		}

		client = createFirebaseAuthClient({ app })
	}

	await client.initialize()
	return client
}

/** Válido só depois do initAuthClient() do boot (main.tsx aguarda). */
export function getAuth(): AuthClient {
	if (!client) throw new Error('AuthClient não inicializado — initAuthClient() roda no boot.')
	return client
}
