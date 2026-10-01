import { UnauthorizedError } from '@coploy/shared/errors'

import { verifyBearer } from '@/lib/verify-bearer'

/**
 * O defeito: `verifyToken` LANÇA quando o token não presta, e duas rotas o
 * chamavam solto — `/auth/me` e a atualização do candidato respondiam 500 para
 * sessão vencida. O cliente não distinguia "faça login de novo" de "o servidor
 * quebrou", e o app do candidato mostrava erro genérico em vez de mandar a
 * pessoa entrar. Encontrado testando a tela de Divulgação no stack local.
 */
const ok = async () => ({ uid: 'u1' })
const explode = async () => {
	throw new Error('Invalid or expired token')
}

/*
 * O que decide o 401 é o TIPO do erro: o handler compartilhado responde por
 * `instanceof UnauthorizedError || err.name === 'UnauthorizedError'`. Testar um
 * `statusCode` que a classe não carrega passaria a impressão errada de cobertura.
 */
function da401(e: unknown) {
	return e instanceof UnauthorizedError && (e as Error).name === 'UnauthorizedError'
}

describe('verificação do Bearer', () => {
	it('devolve o uid quando o token vale', async () => {
		expect(await verifyBearer('Bearer abc', ok)).toBe('u1')
	})

	/* Os quatro caminhos de falha viram a MESMA resposta: 401. */
	it.each([
		['sem cabeçalho', undefined],
		['sem o prefixo Bearer', 'abc'],
		['prefixo errado', 'Basic abc'],
	])('%s → 401', async (_caso, header) => {
		const erro = await verifyBearer(header as string | undefined, ok).catch((e) => e)
		expect(da401(erro)).toBe(true)
	})

	it('token inválido ou expirado → 401, não 500', async () => {
		const erro = await verifyBearer('Bearer podre', explode).catch((e) => e)
		expect(da401(erro)).toBe(true)
	})

	/* Verificador que devolve objeto sem uid é falha, não sucesso silencioso. */
	it('sem uid na resposta → 401', async () => {
		const erro = await verifyBearer('Bearer x', async () => ({}) as { uid: string }).catch((e) => e)
		expect(da401(erro)).toBe(true)
	})

	/*
	 * A mensagem é uma só de propósito: dizer "expirado" em vez de "inválido"
	 * conta a quem sonda que aquele token já existiu algum dia.
	 */
	it('não distingue expirado de inválido na mensagem', async () => {
		const a = await verifyBearer('Bearer x', explode).catch((e) => (e as Error).message)
		const b = await verifyBearer('Bearer y', async () => {
			throw new Error('token expirado às 3h')
		}).catch((e) => (e as Error).message)
		expect(a).toBe(b)
	})
})
