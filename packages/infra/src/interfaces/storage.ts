export type PresignedUploadResult = {
	uploadUrl: string
	downloadUrl: string
	objectPath: string
}

export type StorageAdapter = {
	uploadFile(
		file: Buffer,
		path: string,
		filename: string,
		contentType: string,
	): Promise<string>

	getDownloadUrl(path: string, filename: string): Promise<string | null>

	downloadFile(path: string, filename: string): Promise<Buffer | null>

	fileExists(path: string, filename: string): Promise<boolean>

	deleteFile(path: string, filename: string): Promise<void>

	deleteDirectory(path: string): Promise<{ deletedCount: number }>

	getPresignedUploadUrl?(
		path: string,
		filename: string,
		contentType: string,
	): Promise<PresignedUploadResult>
}
