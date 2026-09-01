import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

const PREFIX = 'enc:v1:'

/**
 * Encrypts plaintext using AES-256-GCM.
 *
 * @param plaintext - The text to encrypt
 * @param key - Hex-encoded 32-byte key (64 hex chars)
 * @returns Encrypted string in format `enc:v1:iv:authTag:ciphertext` (iv/authTag/ciphertext hex-encoded)
 */
export function encrypt(plaintext: string, key: string): string {
	const keyBuffer = Buffer.from(key, 'hex')
	if (keyBuffer.length !== 32) {
		throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
	}

	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	})

	const encrypted = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	])
	const authTag = cipher.getAuthTag()

	return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a string encrypted with `encrypt()`.
 *
 * @param ciphertext - Encrypted string in format `enc:v1:iv:authTag:ciphertext`
 * @param key - Hex-encoded 32-byte key (64 hex chars)
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string, key: string): string {
	if (!ciphertext.startsWith(PREFIX)) {
		throw new Error(`Invalid ciphertext format — expected prefix "${PREFIX}"`)
	}

	const keyBuffer = Buffer.from(key, 'hex')
	if (keyBuffer.length !== 32) {
		throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
	}

	const parts = ciphertext.slice(PREFIX.length).split(':')
	if (parts.length !== 3) {
		throw new Error('Invalid ciphertext format — expected enc:v1:iv:authTag:ciphertext')
	}

	const [ivHex, authTagHex, encryptedHex] = parts
	const iv = Buffer.from(ivHex!, 'hex')
	const authTag = Buffer.from(authTagHex!, 'hex')
	const encrypted = Buffer.from(encryptedHex!, 'hex')

	const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	})
	decipher.setAuthTag(authTag)

	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	])

	return decrypted.toString('utf8')
}

/**
 * Returns true if the value carries the `enc:v1:` prefix produced by `encrypt()`.
 * Used to detect already-encrypted values during backfill migration and to
 * distinguish ciphertext from legacy plaintext at read boundaries.
 *
 * Falsos positivos são impossíveis: o prefixo é literal e nenhum token Gupy
 * ou senha de usuário começa com `enc:v1:`.
 */
export function isEncrypted(value: string): boolean {
	return value.startsWith(PREFIX)
}
