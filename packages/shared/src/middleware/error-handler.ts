import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

import { BadRequestError } from '../errors/bad-request'
import { NotFoundError } from '../errors/not-found'
import { StripeError } from '../errors/stripe'
import { UnauthorizedError } from '../errors/unauthorized'
import { secureLogger } from '../utils/secure-logger'

type FastifyErrorHandler = (
	error: FastifyError,
	request: FastifyRequest,
	reply: FastifyReply,
) => void

const firebaseErrorMessages: Record<string, string> = {
	'auth/email-already-in-use': 'Este email já está em uso',
	'auth/email-already-exists': 'Este email já está em uso',
	'auth/invalid-email': 'Email inválido',
	'auth/operation-not-allowed': 'Operação não permitida',
	'auth/weak-password': 'A senha é muito fraca',
	'auth/user-disabled': 'Este usuário está desabilitado',
	'auth/user-not-found': 'Usuário não encontrado',
	'auth/wrong-password': 'Senha incorreta',
}

const stripeErrorMessages: Record<string, string> = {
	card_declined: 'Seu cartão foi recusado',
	expired_card: 'Seu cartão expirou',
	incorrect_cvc: 'O código de segurança do cartão está incorreto',
	insufficient_funds: 'Fundos insuficientes',
	invalid_cvc: 'O código de segurança do cartão é inválido',
	invalid_expiry_month: 'O mês de expiração é inválido',
	invalid_expiry_year: 'O ano de expiração é inválido',
	invalid_number: 'O número do cartão é inválido',
	api_key_expired: 'Chave da API expirada',
	invalid_request_error: 'Requisição inválida',
	rate_limit_error: 'Muitas requisições',
	payment_intent_authentication_failure: 'Falha na autenticação do pagamento',
	payment_method_unactivated: 'Método de pagamento não ativado',
	subscription_incomplete: 'Assinatura incompleta',
	customer_deleted: 'Cliente foi removido',
	resource_missing: 'Recurso não encontrado',
}

function handleStripeApiError(err: Record<string, unknown>, reply: FastifyReply): boolean {
	if (!String(err.type ?? '').includes('StripeError')) return false

	const code = String(err.code ?? err.decline_code ?? err.type ?? '')
	const message = stripeErrorMessages[code] ?? String(err.message ?? 'Erro no processamento de pagamento')
	const statusCode = Number(err.statusCode) || 400

	reply.status(statusCode).send({ message, code, type: 'stripe_error' })
	return true
}

function handleFirebaseError(err: Record<string, unknown>, reply: FastifyReply): boolean {
	const code = String(err.code ?? '')
	const isFirebaseError = err.name === 'FirebaseError' || code.startsWith('auth/')
	if (!isFirebaseError) return false

	const message = firebaseErrorMessages[code] ?? String(err.message)
	reply.status(400).send({ message, code })
	return true
}

function handleZodError(error: Error, reply: FastifyReply): boolean {
	if (!(error instanceof ZodError)) return false

	const errors = error.issues.map((issue) => ({
		path: issue.path.join('.'),
		message: issue.message,
		code: issue.code,
	}))

	reply.status(400).send({
		message: 'Validation error',
		details: 'Os dados de entrada contêm campos inválidos',
		errors,
	})
	return true
}

function handleSerializationError(err: Record<string, unknown>, reply: FastifyReply): boolean {
	if (err.code !== 'FST_ERR_RESPONSE_SERIALIZATION') return false
	if (!(err.cause instanceof ZodError)) return false

	const errors = err.cause.issues.map((issue) => ({
		path: issue.path.join('.'),
		message: issue.message,
		code: issue.code,
	}))

	reply.status(400).send({
		message: 'Response validation error',
		details: 'A resposta contém campos inválidos ou ausentes',
		errors,
	})
	return true
}

/**
 * Fastify global error handler.
 *
 * Handles Firebase, Stripe, Zod validation, custom error classes,
 * rate limiting, and CORS errors with structured JSON responses.
 *
 * @example
 * ```typescript
 * import { errorHandler } from '@coploy/shared/middleware'
 * app.setErrorHandler(errorHandler)
 * ```
 */
export const errorHandler: FastifyErrorHandler = (error, request, reply) => {
	const err = error as unknown as Record<string, unknown>

	if (handleStripeApiError(err, reply)) return
	if (error instanceof StripeError) {
		reply.status(400).send({ message: error.message, type: 'stripe_error' })
		return
	}

	if (handleFirebaseError(err, reply)) return

	if (err.code === 'FST_ERR_VALIDATION') {
		const validation = (err as { validation?: unknown }).validation
		console.warn(
			`[Validation] ${request.method} ${request.url}: ${err.message} ${
				validation ? JSON.stringify(validation) : ''
			}`,
		)
		reply.status(400).send({ message: 'Validation error', details: err.message })
		return
	}

	if (handleSerializationError(err, reply)) return
	if (handleZodError(error, reply)) return

	if (error instanceof BadRequestError || err.name === 'BadRequestError') {
		reply.status(400).send({ message: error.message })
		return
	}

	if (error instanceof NotFoundError || err.name === 'NotFoundError') {
		reply.status(404).send({ message: error.message })
		return
	}

	if (error instanceof UnauthorizedError || err.name === 'UnauthorizedError') {
		reply.status(401).send({ message: error.message })
		return
	}

	if (err.code === 'FST_ERR_RATE_LIMIT' || Number(err.statusCode) === 429) {
		reply.status(429).send({
			error: 'Rate limit exceeded',
			message: String(err.message ?? 'Muitas requisições. Tente novamente mais tarde.'),
			statusCode: 429,
		})
		return
	}

	if (err.name === 'CORSForbiddenError') {
		reply.status(403).send({ message: 'Access denied: Origin not allowed', code: 'CORS_FORBIDDEN' })
		return
	}

	secureLogger.error('Unhandled error', {
		name: err.name,
		code: err.code,
		message: err.message,
		stack: String(err.stack ?? '').split('\n').slice(0, 5).join('\n'),
	}, request)

	reply.status(500).send({ message: 'Internal server error' })
}
