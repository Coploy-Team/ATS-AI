import { randomInt } from 'node:crypto'
import { z } from 'zod'

/**
 * Schema de validação de senha segura
 * Implementa política de senha forte para proteger contra ataques de força bruta
 */

// Regex patterns definidos no escopo superior para performance
const UPPERCASE_REGEX = /[A-Z]/
const LOWERCASE_REGEX = /[a-z]/
const NUMBERS_REGEX = /\d/
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/
const SEQUENTIAL_PATTERNS_REGEX = /123456|abcdef|qwerty|asdfgh|zxcvbn/i
const REPETITION_REGEX = /(.)\1{3,}/
const SIMPLE_SEQUENCES_REGEX = /123|abc|qwe/i
const REPETITION_SCORE_REGEX = /(.)\1{2,}/

// Configuração da política de senha
const PASSWORD_CONFIG = {
	minLength: 8,
	maxLength: 128,
	requireUppercase: true,
	requireLowercase: true,
	requireNumbers: true,
	requireSpecialChars: true,
	forbiddenPasswords: [
		'password',
		'123456',
		'password123',
		'admin',
		'qwerty',
		'12345678',
		'123456789',
		'password1',
		'abc123',
		'Password1',
	],
}

/**
 * Lista de senhas comuns que devem ser rejeitadas
 * Base: Top 25 senhas mais comuns + variações
 */
const COMMON_PASSWORDS = new Set([
	'123456',
	'password',
	'12345678',
	'qwerty',
	'123456789',
	'12345',
	'1234',
	'111111',
	'1234567',
	'dragon',
	'123123',
	'baseball',
	'abc123',
	'football',
	'monkey',
	'letmein',
	'shadow',
	'master',
	'666666',
	'qwertyuiop',
	'123321',
	'mustang',
	'1234567890',
	'michael',
	'654321',
	'superman',
	'1qaz2wsx',
	'7777777',
	'fuckyou',
	'121212',
	'000000',
	'qazwsx',
	'123qwe',
	'killer',
	'trustno1',
	'jordan',
	'jennifer',
	'zxcvbnm',
	'asdfgh',
	'hunter',
	'buster',
	'soccer',
	'harley',
	'batman',
	'andrew',
	'tigger',
	'sunshine',
	'iloveyou',
	'2000',
	'charlie',
	'robert',
	'thomas',
	'hockey',
	'ranger',
	'daniel',
	'starwars',
	'klaster',
	'112233',
	'george',
	'computer',
	'michelle',
	'jessica',
	'pepper',
	'1111',
	'zxcvbn',
	'555555',
	'11111111',
	'131313',
	'freedom',
	'777777',
	'pass',
	'maggie',
	'159753',
	'aaaaaa',
	'ginger',
	'princess',
	'joshua',
	'cheese',
	'amanda',
	'summer',
	'love',
	'ashley',
	'nicole',
	'chelsea',
	'biteme',
	'matthew',
	'access',
	'yankees',
	'987654321',
	'dallas',
	'austin',
	'thunder',
	'taylor',
	'matrix',
	'mobilemail',
	'mom',
	'monitor',
	'monitoring',
	'montana',
	'moon',
	'moscow',
])

/**
 * Função para validar força da senha
 */
function validatePasswordStrength(password: string): {
	isValid: boolean
	errors: string[]
} {
	const errors: string[] = []

	// Verificar comprimento
	if (password.length < PASSWORD_CONFIG.minLength) {
		errors.push(
			`A senha deve ter pelo menos ${PASSWORD_CONFIG.minLength} caracteres`,
		)
	}

	if (password.length > PASSWORD_CONFIG.maxLength) {
		errors.push(
			`A senha não pode ter mais de ${PASSWORD_CONFIG.maxLength} caracteres`,
		)
	}

	// Verificar maiúsculas
	if (PASSWORD_CONFIG.requireUppercase && !UPPERCASE_REGEX.test(password)) {
		errors.push('A senha deve conter pelo menos uma letra maiúscula')
	}

	// Verificar minúsculas
	if (PASSWORD_CONFIG.requireLowercase && !LOWERCASE_REGEX.test(password)) {
		errors.push('A senha deve conter pelo menos uma letra minúscula')
	}

	// Verificar números
	if (PASSWORD_CONFIG.requireNumbers && !NUMBERS_REGEX.test(password)) {
		errors.push('A senha deve conter pelo menos um número')
	}

	// Verificar caracteres especiais
	if (
		PASSWORD_CONFIG.requireSpecialChars &&
		!SPECIAL_CHARS_REGEX.test(password)
	) {
		errors.push(
			'A senha deve conter pelo menos um caractere especial (!@#$%^&* etc.)',
		)
	}

	// Verificar senhas comuns
	if (COMMON_PASSWORDS.has(password.toLowerCase())) {
		errors.push('Esta senha é muito comum e não pode ser usada')
	}

	// Verificar senhas proibidas específicas
	if (
		PASSWORD_CONFIG.forbiddenPasswords.some((forbidden) =>
			password.toLowerCase().includes(forbidden.toLowerCase()),
		)
	) {
		errors.push('A senha contém termos não permitidos')
	}

	// Verificar padrões sequenciais simples
	if (SEQUENTIAL_PATTERNS_REGEX.test(password)) {
		errors.push('A senha não pode conter sequências simples de caracteres')
	}

	// Verificar repetições excessivas
	if (REPETITION_REGEX.test(password)) {
		errors.push(
			'A senha não pode conter mais de 3 caracteres consecutivos iguais',
		)
	}

	return {
		isValid: errors.length === 0,
		errors,
	}
}

/**
 * Schema Zod para validação de senha
 */
export const passwordSchema = z
	.string()
	.min(
		PASSWORD_CONFIG.minLength,
		`A senha deve ter pelo menos ${PASSWORD_CONFIG.minLength} caracteres`,
	)
	.max(
		PASSWORD_CONFIG.maxLength,
		`A senha não pode ter mais de ${PASSWORD_CONFIG.maxLength} caracteres`,
	)
	.refine(
		(password) => {
			const validation = validatePasswordStrength(password)
			return validation.isValid
		},
		(password) => {
			const validation = validatePasswordStrength(password)
			return {
				message: validation.errors.join('. '),
			}
		},
	)

/**
 * Schema para confirmação de senha
 */
export const passwordConfirmationSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'As senhas não coincidem',
		path: ['confirmPassword'],
	})

/**
 * Schema simplificado para senhas existentes (login)
 */
export const existingPasswordSchema = z
	.string()
	.min(1, 'Senha é obrigatória')
	.max(PASSWORD_CONFIG.maxLength, 'Senha muito longa')

/**
 * Schema para mudança de senha
 */
export const changePasswordSchema = z
	.object({
		currentPassword: existingPasswordSchema,
		newPassword: passwordSchema,
		confirmNewPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmNewPassword, {
		message: 'As senhas novas não coincidem',
		path: ['confirmNewPassword'],
	})
	.refine((data) => data.currentPassword !== data.newPassword, {
		message: 'A nova senha deve ser diferente da senha atual',
		path: ['newPassword'],
	})

/**
 * Função helper para gerar sugestão de senha forte
 */
export function generatePasswordSuggestion(): string {
	const lowercase = 'abcdefghijklmnopqrstuvwxyz'
	const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	const numbers = '0123456789'
	const specials = '!@#$%^&*()_+-=[]{}|;:,.<>?'

	let password = ''

	// Garantir pelo menos um de cada tipo obrigatório
	password += lowercase[randomInt(lowercase.length)]
	password += uppercase[randomInt(uppercase.length)]
	password += numbers[randomInt(numbers.length)]
	password += specials[randomInt(specials.length)]

	// Completar com caracteres aleatórios
	const allChars = lowercase + uppercase + numbers + specials
	for (let i = password.length; i < 12; i++) {
		password += allChars[randomInt(allChars.length)]
	}

	// Embaralhar a senha de forma segura
	const arr = password.split('')
	for (let i = arr.length - 1; i > 0; i--) {
		const j = randomInt(i + 1)
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}
	return arr.join('')
}

/**
 * Função para calcular score de força da senha (0-100)
 */
export function calculatePasswordScore(password: string): number {
	let score = 0

	// Comprimento (até 25 pontos)
	score += Math.min(password.length * 2, 25)

	// Maiúsculas (10 pontos)
	if (UPPERCASE_REGEX.test(password)) {
		score += 10
	}

	// Minúsculas (10 pontos)
	if (LOWERCASE_REGEX.test(password)) {
		score += 10
	}

	// Números (10 pontos)
	if (NUMBERS_REGEX.test(password)) {
		score += 10
	}

	// Caracteres especiais (15 pontos)
	if (SPECIAL_CHARS_REGEX.test(password)) {
		score += 15
	}

	// Diversidade de caracteres (10 pontos)
	const uniqueChars = new Set(password).size
	if (uniqueChars >= password.length * 0.7) {
		score += 10
	}

	// Não é senha comum (10 pontos)
	if (!COMMON_PASSWORDS.has(password.toLowerCase())) {
		score += 10
	}

	// Penalidades
	// Sequências simples
	if (SIMPLE_SEQUENCES_REGEX.test(password)) {
		score -= 10
	}

	// Repetições
	if (REPETITION_SCORE_REGEX.test(password)) {
		score -= 10
	}

	return Math.max(0, Math.min(100, score))
}

/**
 * Tipos exportados
 */
export type PasswordValidation = {
	isValid: boolean
	errors: string[]
	score: number
	strength: 'Muito Fraca' | 'Fraca' | 'Regular' | 'Forte' | 'Muito Forte'
}

/**
 * Função completa de validação de senha
 */
export function validatePassword(password: string): PasswordValidation {
	const validation = validatePasswordStrength(password)
	const score = calculatePasswordScore(password)

	let strength: PasswordValidation['strength']
	if (score < 30) {
		strength = 'Muito Fraca'
	} else if (score < 50) {
		strength = 'Fraca'
	} else if (score < 70) {
		strength = 'Regular'
	} else if (score < 90) {
		strength = 'Forte'
	} else {
		strength = 'Muito Forte'
	}

	return {
		isValid: validation.isValid,
		errors: validation.errors,
		score,
		strength,
	}
}
