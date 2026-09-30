import { UnauthorizedError } from '@coploy/shared/errors'

/**
 * Lê o Bearer do cabeçalho e verifica o token.
 *
 * ⚠️ Existe porque `verifyToken` LANÇA quando o token é inválido ou expirou, e
 * duas rotas o chamavam solto: `/auth/me` e a atualização do candidato
 * respondiam **500** para sessão vencida. O cliente não tem como distinguir
 * "faça login de novo" de "o servidor quebrou" — e o app do candidato ficava
 * mostrando erro genérico em vez de mandar a pessoa entrar.
 *
 * Token ausente, malformado, inválido ou expirado são a mesma resposta: 401.
 * A mensagem também é uma só, de propósito — dizer "expirado" em vez de
 * "inválido" conta a quem sonda que aquele token já existiu.
 */
export async function verifyBearer(
	authorization: string | undefined,
	verifyToken: (token: string) => Promise<{ uid: string }>,
): Promise<string> {
	if (!authorization?.startsWith('Bearer ')) {
		throw new UnauthorizedError('Missing or invalid authorization header')
	}
	try {
		const decoded = await verifyToken(authorization.substring(7))
		if (!decoded?.uid) throw new Error('sem uid')
		return decoded.uid
	} catch {
		throw new UnauthorizedError('Invalid auth token')
	}
}
