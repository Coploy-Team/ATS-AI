/**
 * Tipos e constantes para Firebase Hosting API
 */

export interface FirebaseHostingErrorResponse {
	error: {
		code: number
		message: string
		status: string
	}
}

/**
 * Mapeamento de mensagens de erro amigáveis para códigos Firebase Hosting
 */
export const FirebaseHostingErrorMessages = {
	ALREADY_EXISTS: 'Este domínio já está configurado neste projeto.',
	INVALID_ARGUMENT: 'Os dados fornecidos são inválidos.',
	NOT_FOUND: 'O site Firebase não foi encontrado.',
	PERMISSION_DENIED: 'Permissão negada para este recurso.',
	UNAUTHENTICATED: 'Token de autenticação inválido.',
	RESOURCE_EXHAUSTED: 'Limite de recursos atingido.',
	FAILED_PRECONDITION: 'Pré-condições não foram atendidas.',
	UNAVAILABLE: 'Serviço temporariamente indisponível.',
} as const

export type FirebaseHostingErrorStatus =
	keyof typeof FirebaseHostingErrorMessages
