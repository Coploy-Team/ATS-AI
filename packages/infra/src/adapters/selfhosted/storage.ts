import { Client as MinioClient } from 'minio'
import { Readable } from 'node:stream'

import type { PresignedUploadResult, StorageAdapter } from '../../interfaces/storage'

export type MinioConfig = {
	endPoint: string
	port: number
	useSSL: boolean
	accessKey: string
	secretKey: string
	bucketName: string
	publicUrl?: string
}

export function createMinioAdapter(config: MinioConfig): StorageAdapter {
	const client = new MinioClient({
		endPoint: config.endPoint,
		port: config.port,
		useSSL: config.useSSL,
		accessKey: config.accessKey,
		secretKey: config.secretKey,
	})

	const bucket = config.bucketName
	const publicBaseUrl = config.publicUrl
		?? `${config.useSSL ? 'https' : 'http'}://${config.endPoint}:${config.port}/${bucket}`

	async function ensureBucket(): Promise<void> {
		const exists = await client.bucketExists(bucket)
		if (!exists) {
			await client.makeBucket(bucket)
			console.info(`[MinIO] Bucket created: ${bucket}`)
		}

		const publicReadPolicy = JSON.stringify({
			Version: '2012-10-17',
			Statement: [{
				Effect: 'Allow',
				Principal: { AWS: ['*'] },
				Action: ['s3:GetObject'],
				Resource: [`arn:aws:s3:::${bucket}/*`],
			}],
		})

		try {
			await client.setBucketPolicy(bucket, publicReadPolicy)
		} catch (err) {
			console.warn('[MinIO] Could not set public read policy:', (err as Error).message)
		}
	}

	let bucketReady: Promise<void> | null = null

	function getBucketReady(): Promise<void> {
		if (!bucketReady) {
			bucketReady = ensureBucket()
		}
		return bucketReady
	}

	return {
		async uploadFile(
			file: Buffer,
			path: string,
			filename: string,
			contentType: string,
		): Promise<string> {
			await getBucketReady()

			const objectName = `${path}/${filename}`
			const stream = Readable.from(file)

			await client.putObject(bucket, objectName, stream, file.length, {
				'Content-Type': contentType,
			})

			return `${publicBaseUrl}/${objectName}`
		},

		async getDownloadUrl(path: string, filename: string): Promise<string | null> {
			await getBucketReady()

			const objectName = `${path}/${filename}`

			try {
				await client.statObject(bucket, objectName)
			} catch {
				return null
			}

			const presignedTtl = 7 * 24 * 60 * 60
			return client.presignedGetObject(bucket, objectName, presignedTtl)
		},

		async downloadFile(path: string, filename: string): Promise<Buffer | null> {
			await getBucketReady()

			const objectName = `${path}/${filename}`

			try {
				await client.statObject(bucket, objectName)
			} catch {
				return null
			}

			const stream = await client.getObject(bucket, objectName)
			const chunks: Buffer[] = []
			for await (const chunk of stream) {
				chunks.push(chunk as Buffer)
			}
			return Buffer.concat(chunks)
		},

		async fileExists(path: string, filename: string): Promise<boolean> {
			await getBucketReady()

			const objectName = `${path}/${filename}`

			try {
				await client.statObject(bucket, objectName)
				return true
			} catch {
				return false
			}
		},

		async deleteFile(path: string, filename: string): Promise<void> {
			await getBucketReady()

			const objectName = `${path}/${filename}`

			try {
				await client.removeObject(bucket, objectName)
			} catch (error) {
				console.error(`[MinIO] deleteFile error for ${objectName}:`, error)
			}
		},

		async deleteDirectory(path: string): Promise<{ deletedCount: number }> {
			await getBucketReady()

			const prefix = path.endsWith('/') ? path : `${path}/`
			const objectNames: string[] = []
			try {
				const stream = client.listObjectsV2(bucket, prefix, true)
				await new Promise<void>((resolve, reject) => {
					stream.on('data', (obj) => {
						if (obj.name) objectNames.push(obj.name)
					})
					stream.on('end', () => resolve())
					stream.on('error', (err) => reject(err))
				})
				if (objectNames.length === 0) return { deletedCount: 0 }
				await client.removeObjects(bucket, objectNames)
				return { deletedCount: objectNames.length }
			} catch (error) {
				console.error(`[MinIO] deleteDirectory error for ${prefix}:`, error)
				return { deletedCount: 0 }
			}
		},

		async getPresignedUploadUrl(
			path: string,
			filename: string,
			_contentType: string,
		): Promise<PresignedUploadResult> {
			await getBucketReady()

			const objectName = `${path}/${filename}`
			const uploadTtl = 60 * 60
			const downloadTtl = 7 * 24 * 60 * 60

			const uploadUrl = await client.presignedPutObject(bucket, objectName, uploadTtl)

			const downloadUrl = await client.presignedGetObject(bucket, objectName, downloadTtl)

			return {
				uploadUrl,
				downloadUrl,
				objectPath: objectName,
			}
		},
	}
}
