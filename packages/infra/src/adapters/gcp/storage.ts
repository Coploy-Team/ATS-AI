import type { App } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'

import type { StorageAdapter } from '../../interfaces/storage'

export function createGcsStorageAdapter(app: App): StorageAdapter {
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
					metadata: { firebaseStorageDownloadTokens: token },
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

		async downloadFile(path: string, filename: string): Promise<Buffer | null> {
			const filePath = `${path}/${filename}`
			const fileRef = bucket.file(filePath)

			const [exists] = await fileRef.exists()
			if (!exists) return null

			const [buffer] = await fileRef.download()
			return buffer
		},

		async fileExists(path: string, filename: string): Promise<boolean> {
			const filePath = `${path}/${filename}`
			const fileRef = bucket.file(filePath)
			const [exists] = await fileRef.exists()
			return exists
		},

		async deleteFile(path: string, filename: string): Promise<void> {
			const filePath = `${path}/${filename}`
			const fileRef = bucket.file(filePath)
			const [exists] = await fileRef.exists()
			if (exists) {
				await fileRef.delete()
			}
		},

		async deleteDirectory(path: string): Promise<{ deletedCount: number }> {
			const prefix = path.endsWith('/') ? path : `${path}/`
			const [files] = await bucket.getFiles({ prefix })
			if (files.length === 0) return { deletedCount: 0 }
			await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })))
			return { deletedCount: files.length }
		},
	}
}
