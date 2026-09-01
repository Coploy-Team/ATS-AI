import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

import { renderPasswordResetEmail } from '@/emails/password-reset'
import { env } from '@/env'
import { PostmarkClient, postmarkClient } from '@/lib/postmark-client'

export type PasswordEmailClient = Pick<PostmarkClient, 'sendEmail'>

const FROM_EMAIL = 'no-reply@coploy.io'

/** O Firebase expira o oobCode em 1 hora; o e-mail diz a mesma coisa. */
const LINK_EXPIRES_IN_HOURS = 1

/**
 * Política de senha do produto.
 *
 * O Firebase valida a dele no momento da troca e devolve mensagem em inglês,
 * genérica. Validar aqui deixa o erro em português e evita a viagem de ida e
 * volta só para descobrir que faltava um caractere.
 */
const MIN_LENGTH = 8

function assertStrongEnough(password: string): void {
	if (password.length < MIN_LENGTH) {
		throw new BadRequestError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`)
	}
	if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
		throw new BadRequestError('A senha precisa ter letras maiúsculas e minúsculas.')
	}
	if (!/\d/.test(password)) {
		throw new BadRequestError('A senha precisa ter pelo menos um número.')
	}
}

/**
 * Senha: pedir redefinição e trocar estando logado.
 *
 * O token de redefinição continua sendo do Firebase — uso único, com
 * expiração, invalidado na troca. O que passou a ser nosso é a ENTREGA
 * (Postmark, nosso template) e a TELA (o ATS), porque o link do Firebase leva
 * a uma página hospedada que não tem nossa marca nem nosso idioma.
 *
 * `generatePasswordResetLink` NÃO dispara e-mail: ele só devolve o link. É o
 * que torna a troca possível sem reimplementar a parte difícil.
 */
export function createPasswordService(
	infra: InfraProvider,
	emailClient: PasswordEmailClient = postmarkClient,
) {
	return {
		/**
		 * Manda o link de redefinição.
		 *
		 * SEMPRE responde sucesso, exista a conta ou não. Diferenciar as duas
		 * respostas transformaria esta rota — que é pública por necessidade — num
		 * verificador de e-mails cadastrados: quem quisesse saber se alguém tem
		 * conta na Coploy bastaria perguntar.
		 */
		async requestReset(params: { email: string; language?: string | null }) {
			const email = params.email.trim().toLowerCase()

			try {
				if (!infra.auth.generatePasswordResetLink) {
					// selfhosted sem suporte: silenciar seria pior, some no log
					console.warn('[Password] adapter sem generatePasswordResetLink; pedido ignorado')
					return { status: 'sent' as const }
				}

				const user = await infra.auth.getUserByEmail(email)
				if (!user) return { status: 'sent' as const }

				/*
				 * O Firebase NÃO devolve um link para o nosso destino — devolve o
				 * link do ACTION HANDLER do projeto (configurado no Console) com o
				 * `continueUrl` pendurado como parâmetro. Passar o destino não faz
				 * bypass: o clique cai no handler, que em produção é o app de
				 * entrevista. Foi assim que um e-mail de homolog saiu apontando para
				 * `interview.coploy.io`.
				 *
				 * O que importa do link é só o `oobCode`. Extraímos ele e montamos o
				 * endereço nós mesmos — que é o único jeito de o e-mail levar à tela
				 * do ATS, no ambiente certo.
				 */
				const link = await infra.auth.generatePasswordResetLink(email)
				const codigo = new URL(link).searchParams.get('oobCode')

				if (!codigo) {
					/*
					 * Sem o código não dá para montar o endereço. Mandar o link cru
					 * seria pior que não mandar: em homolog ele aponta para o handler
					 * de PRODUÇÃO, e alguém testando aqui trocaria a senha de lá.
					 */
					console.error('[Password] link do Firebase sem oobCode; e-mail não enviado')
					return { status: 'sent' as const }
				}

				const resetUrl = `${env.ATS_APP_URL}/redefinir-senha?oobCode=${encodeURIComponent(codigo)}`

				const rendered = renderPasswordResetEmail({
					name: (user as { displayName?: string | null }).displayName ?? null,
					resetUrl,
					expiresInHours: LINK_EXPIRES_IN_HOURS,
					language: params.language ?? 'pt-BR',
				})

				await emailClient.sendEmail({
					from: FROM_EMAIL,
					to: email,
					subject: rendered.subject,
					htmlBody: rendered.htmlBody,
					textBody: rendered.textBody,
					tag: 'password-reset',
				})
			} catch (error) {
				/*
				 * Falha de envio também responde sucesso, pelo mesmo motivo: um erro
				 * que só aparece para e-mails cadastrados é um oráculo. Fica no log,
				 * que é onde nós olhamos.
				 */
				console.error('[Password] falha ao enviar link de redefinição:', error)
			}

			return { status: 'sent' as const }
		},

		/**
		 * Troca a senha de quem já está logado.
		 *
		 * Exige a senha ATUAL. Sem isso, um notebook destravado ou um token
		 * roubado viram sequestro de conta: quem trocasse a senha passaria a ser
		 * o dono, e o titular perderia o acesso sem nem saber.
		 */
		async changePassword(params: {
			userId: string
			email: string
			currentPassword: string
			newPassword: string
		}) {
			assertStrongEnough(params.newPassword)

			if (params.currentPassword === params.newPassword) {
				throw new BadRequestError('A nova senha precisa ser diferente da atual.')
			}

			try {
				await infra.auth.signInWithPassword(params.email, params.currentPassword)
			} catch {
				throw new BadRequestError('Senha atual incorreta.')
			}

			if (!infra.auth.updateUser) {
				throw new BadRequestError('Troca de senha indisponível neste ambiente.')
			}

			await infra.auth.updateUser(params.userId, { password: params.newPassword })

			return { status: 'changed' as const }
		},
	}
}
