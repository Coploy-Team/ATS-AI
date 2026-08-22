import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import type { FirebaseAdminConfig } from './types'

/**
 * Creates and initializes a Firebase Admin SDK instance.
 *
 * Each app calls this once with its own config to get
 * the initialized app, auth, and database instances.
 *
 * @example
 * ```typescript
 * const firebase = createFirebaseAdmin({
 *   projectId: env.FIREBASE_PROJECT_ID,
 *   clientEmail: env.FIREBASE_CLIENT_EMAIL,
 *   privateKey: env.FIREBASE_PRIVATE_KEY,
 *   databaseURL: env.FIREBASE_DEFAULT_DATABASE_URL,
 *   storageBucket: env.FIREBASE_STORAGE_BUCKET,
 * })
 *
 * const user = await firebase.auth.getUser(uid)
 * ```
 */
export function createFirebaseAdmin(config: FirebaseAdminConfig) {
	const app = initializeApp({
		credential: cert({
			projectId: config.projectId,
			clientEmail: config.clientEmail,
			privateKey: config.privateKey.replace(/\\n/g, '\n'),
		}),
		databaseURL: config.databaseURL,
		storageBucket: config.storageBucket,
	})

	return {
		app,
		auth: getAuth(app),
		db: getFirestore(app),
	}
}
