import { randomUUID } from 'node:crypto'
import type { App } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

/**
 * Creates a Firebase Storage service for file uploads.
 *
 * Generates public download URLs with access tokens,
 * compatible with Firebase Storage's URL format.
 *
 * @example
 * ```typescript
 * const firebase = createFirebaseAdmin(config)
 * const storage = createStorageService(firebase.app)
 *
 * const url = await storage.uploadFile(buffer, 'avatars', 'photo.jpg', 'image/jpeg')
 * ```
 */
export function createStorageService(app: App) {
	const bucket = getStorage(app).bucket()

	return {
		async uploadFile(
			file: Buffer,
			path: string,
			filename: string,
			contentType: string,
		): Promise<string> {
			const filePath = `${path}/${filename}`
			const token = randomUUID()

			const fileRef = bucket.file(filePath)

			await fileRef.save(file, {
				metadata: {
					contentType,
					metadata: {
						firebaseStorageDownloadTokens: token,
					},
				},
			})

			const encodedFilePath = encodeURIComponent(filePath)
			return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedFilePath}?alt=media&token=${token}`
		},

		async getDownloadUrl(path: string, filename: string): Promise<string | null> {
			const filePath = `${path}/${filename}`
			const fileRef = bucket.file(filePath)

			const [exists] = await fileRef.exists()
			if (!exists) return null

			const [metadata] = await fileRef.getMetadata()
			const token = metadata.metadata?.firebaseStorageDownloadTokens

			if (!token) return null

			const encodedFilePath = encodeURIComponent(filePath)
			return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedFilePath}?alt=media&token=${token}`
		},
	}
}

export type StorageService = ReturnType<typeof createStorageService>
