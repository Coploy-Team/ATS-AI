import { encrypt, decrypt, isEncrypted } from '@coploy/shared'

/**
 * Returns the encryption key from ENCRYPTION_KEY env var, or null if not configured.
 * Lazy — reads process.env at call time so dotenv has loaded.
 */
function getEncryptionKey(): string | null {
	return process.env.ENCRYPTION_KEY || null
}

let warnedMissingKeyOnWrite = false
let warnedMissingKeyOnRead = false

function warnOnce(slot: 'write' | 'read', message: string): void {
	if (slot === 'write') {
		if (warnedMissingKeyOnWrite) return
		warnedMissingKeyOnWrite = true
	} else {
		if (warnedMissingKeyOnRead) return
		warnedMissingKeyOnRead = true
	}
	console.warn(message)
}

/**
 * Encrypts a value if ENCRYPTION_KEY is set and the value is not already encrypted.
 * Returns the original value if ENCRYPTION_KEY is not configured (logs once).
 */
export function encryptField(value: string | null | undefined): string | null | undefined {
	if (value == null) return value

	const key = getEncryptionKey()
	if (!key) {
		warnOnce(
			'write',
			'[crypto] ENCRYPTION_KEY not set — sensitive fields will be stored in plaintext. Configure ENCRYPTION_KEY to enable at-rest encryption.',
		)
		return value
	}

	if (isEncrypted(value)) return value

	return encrypt(value, key)
}

/**
 * Decrypts a value if it carries the encryption prefix and ENCRYPTION_KEY is set.
 *
 * Behavior matrix:
 *  - value null/undefined → returns value
 *  - plaintext (sem prefixo enc:v1:) → returns as-is (mixed-state read OK)
 *  - encrypted + key set → returns decrypted plaintext
 *  - encrypted + key MISSING → logs once + returns raw ciphertext (set ENCRYPTION_KEY to recover)
 *  - encrypted + key set + decrypt falha → logs error + retorna ciphertext bruto
 */
export function decryptField(value: string | null | undefined): string | null | undefined {
	if (value == null) return value

	const looksEncrypted = isEncrypted(value)
	const key = getEncryptionKey()

	if (!key) {
		if (looksEncrypted) {
			warnOnce(
				'read',
				'[crypto] Encrypted field detected but ENCRYPTION_KEY is not set — returning raw ciphertext. Set ENCRYPTION_KEY to recover the original value.',
			)
		}
		return value
	}

	if (!looksEncrypted) return value

	try {
		return decrypt(value, key)
	} catch (err) {
		console.error('[crypto] Failed to decrypt field — returning raw value:', (err as Error).message)
		return value
	}
}
