import { google } from 'googleapis'
import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'

/**
 * Obter token de acesso para APIs do Google
 * Usado para autenticar com Firebase Hosting API
 */
export async function getAccessToken(): Promise<string> {
	try {
		// GCP-only env variables — cast required since env type is a union
		const gcpEnv = env as any
		// Configurar autenticação usando credenciais Firebase Admin
		const auth = new google.auth.GoogleAuth({
			credentials: {
				client_email: gcpEnv.FIREBASE_CLIENT_EMAIL,
				private_key: gcpEnv.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
				project_id: gcpEnv.FIREBASE_PROJECT_ID,
			},
			scopes: [
				'https://www.googleapis.com/auth/firebase',
				'https://www.googleapis.com/auth/firebase.hosting',
			],
		})

		const client = await auth.getClient()
		const tokenResponse = await client.getAccessToken()

		if (!tokenResponse.token) {
			throw new BadRequestError('Failed to get access token from Google APIs')
		}

		return tokenResponse.token
	} catch (error) {
		throw new BadRequestError(error as string)
	}
}
