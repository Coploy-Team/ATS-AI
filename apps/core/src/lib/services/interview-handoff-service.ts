import { randomBytes } from 'node:crypto'

import type { InfraProvider } from '@coploy/infra'
import { UnauthorizedError } from '@coploy/shared/errors'
import { firebaseAdminAuth } from '@/lib/init'

/**
 * Handoff de sessão para canais externos (plugin ChatGPT/Claude).
 *
 * O link da entrevista é escrito numa conversa que pode ser compartilhada ou
 * ficar no histórico — então ele NÃO carrega credencial. Carrega um ticket
 * opaco que só vale por poucos minutos e **uma única vez**: quem resgatar
 * primeiro recebe a sessão, e o mesmo link deixa de funcionar imediatamente.
 */

/** Curto de propósito: só precisa sobreviver do chat até o clique. */
const TTL_SECONDS = 300
const CODE_BYTES = 32

export function createInterviewHandoffService(infra: InfraProvider) {
	return {
		async issue(userId: string): Promise<{ code: string; expiresAt: Date }> {
			const code = randomBytes(CODE_BYTES).toString('base64url')
			const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
			await infra.interviewHandoffRepository.createHandoff(code, userId, expiresAt)
			return { code, expiresAt }
		},

		/**
		 * Resgata o ticket e devolve um custom token de sessão.
		 * O consumo é atômico no repositório — corrida ou replay não passam.
		 */
		async redeem(code: string): Promise<{ sessionToken: string }> {
			const handoff = await infra.interviewHandoffRepository.consumeHandoff(code)
			if (!handoff?.userId) {
				// Mensagem única pra qualquer falha: não revela se o código existiu,
				// expirou ou já foi usado.
				throw new UnauthorizedError('Invalid or expired handoff code')
			}
			const sessionToken = await firebaseAdminAuth.createCustomToken(handoff.userId)
			return { sessionToken }
		},
	}
}

export type InterviewHandoffService = ReturnType<typeof createInterviewHandoffService>
