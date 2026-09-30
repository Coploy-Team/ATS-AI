import { encrypt, decrypt, isEncrypted } from '../index'

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('crypto', () => {
	describe('encrypt/decrypt', () => {
		it('should encrypt and decrypt a string', () => {
			const plaintext = 'my-secret-gupy-token-123'
			const encrypted = encrypt(plaintext, TEST_KEY)
			expect(encrypted).not.toBe(plaintext)
			expect(encrypted.startsWith('enc:v1:')).toBe(true)
			// 3 hex parts after the prefix
			expect(encrypted.slice('enc:v1:'.length).split(':')).toHaveLength(3)

			const decrypted = decrypt(encrypted, TEST_KEY)
			expect(decrypted).toBe(plaintext)
		})

		it('should produce different ciphertext for same input (random IV)', () => {
			const plaintext = 'same-token'
			const enc1 = encrypt(plaintext, TEST_KEY)
			const enc2 = encrypt(plaintext, TEST_KEY)
			expect(enc1).not.toBe(enc2)
			expect(decrypt(enc1, TEST_KEY)).toBe(plaintext)
			expect(decrypt(enc2, TEST_KEY)).toBe(plaintext)
		})

		it('should handle empty string', () => {
			const encrypted = encrypt('', TEST_KEY)
			expect(decrypt(encrypted, TEST_KEY)).toBe('')
		})

		it('should handle unicode characters', () => {
			const plaintext = 'senha-com-acentos-ção-ã'
			const encrypted = encrypt(plaintext, TEST_KEY)
			expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext)
		})

		it('should throw on invalid key length', () => {
			expect(() => encrypt('test', 'short-key')).toThrow('ENCRYPTION_KEY must be 32 bytes')
		})

		it('should throw on tampered ciphertext', () => {
			const encrypted = encrypt('test', TEST_KEY)
			const tampered = encrypted.slice(0, -4) + 'dead'
			expect(() => decrypt(tampered, TEST_KEY)).toThrow()
		})

		it('should throw when ciphertext is missing the prefix', () => {
			// formato legado sem prefixo (plaintext que se parecia com encrypted)
			expect(() => decrypt('aabbcc:112233:445566778899', TEST_KEY)).toThrow(
				/expected prefix/i,
			)
		})
	})

	describe('isEncrypted', () => {
		it('should return true for values produced by encrypt()', () => {
			const encrypted = encrypt('test', TEST_KEY)
			expect(isEncrypted(encrypted)).toBe(true)
		})

		it('should return false for plaintext values', () => {
			expect(isEncrypted('my-plain-token')).toBe(false)
			expect(isEncrypted('abc')).toBe(false)
		})

		it('should return false for empty string', () => {
			expect(isEncrypted('')).toBe(false)
		})

		it('should return false for hex-shaped strings without the prefix', () => {
			// Antes da introdução do prefixo, esse formato dava falso positivo.
			expect(isEncrypted('aabbcc:112233:445566')).toBe(false)
			expect(isEncrypted('a:b:c')).toBe(false)
			expect(isEncrypted('a:b')).toBe(false)
			expect(isEncrypted('a:b:c:d')).toBe(false)
		})

		it('should return false for senhas em hex puro (regressão de falso positivo)', () => {
			// Senha hipotética do usuário que mimetizaria o formato antigo.
			expect(isEncrypted('deadbeef:cafebabe:1234567890abcdef')).toBe(false)
		})
	})
})
