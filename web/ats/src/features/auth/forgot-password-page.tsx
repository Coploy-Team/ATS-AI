import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { publico } from '@coploy/sdk/react'

import { Logo } from '@/components/logo'
import { Button } from '@/ui/button'

import { BrandPanel } from './login-page'

/**
 * Pedir o link de nova senha.
 *
 * Tela própria em vez do botão que existia no login: lá o pedido acontecia sem
 * sair do formulário, e a única confirmação era uma faixa de texto acima do
 * campo de senha — fácil de não ver, e impossível de reenviar sem digitar a
 * senha de novo. Aqui o pedido é a tarefa da tela inteira.
 *
 * A resposta é a MESMA existindo conta ou não, porque o servidor responde
 * igual de propósito: distinguir as duas transformaria a tela num verificador
 * de quem tem conta na Coploy.
 */
export function ForgotPasswordPage() {
	const { t, i18n } = useTranslation()
	const pedir = publico.usePostAuthPasswordReset()
	const [email, setEmail] = useState('')
	const [enviado, setEnviado] = useState(false)

	async function enviar(event: FormEvent) {
		event.preventDefault()
		/*
		 * Erro de rede também mostra a confirmação: o servidor já engole a
		 * diferença entre "conta existe" e "não existe", e vazar aqui um "falhou"
		 * que só acontece para e-mails cadastrados desfaria isso.
		 */
		try {
			await pedir.mutateAsync({ data: { email: email.trim(), language: i18n.language } })
		} catch {
			/* silêncio proposital — ver acima */
		}
		setEnviado(true)
	}

	return (
		<div className='grid min-h-screen bg-bg lg:grid-cols-2'>
			<div className='flex items-center justify-center px-4 py-10'>
				<div className='w-full max-w-sm'>
					<div className='mb-6 flex flex-col items-start gap-3'>
						<Logo className='h-11' />
						<div>
							<h1 className='text-[22px]'>{t('password.forgotTitle')}</h1>
							<p className='mt-1 text-[13px] leading-relaxed text-text-2'>
								{t('password.forgotHint')}
							</p>
						</div>
					</div>

					{enviado ? (
						<div className='flex flex-col gap-4'>
							<p className='inline-flex items-start gap-2 rounded-lg bg-lime-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-lime-fg'>
								<Check size={14} className='mt-0.5 shrink-0' />
								{t('password.forgotDone')}
							</p>
							<Link
								to='/login'
								className='inline-flex items-center gap-1.5 text-[12.5px] font-medium text-lime-fg hover:underline'
							>
								<ArrowLeft size={13} /> {t('password.backToLogin')}
							</Link>
						</div>
					) : (
						<form onSubmit={enviar} className='flex flex-col gap-3'>
							<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
								{t('login.email')}
								<input
									type='email'
									required
									autoFocus
									autoComplete='email'
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									className='h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text'
								/>
							</label>

							<Button
								type='submit'
								variant='primary'
								size='lg'
								disabled={pedir.isPending || !email.trim()}
								className='mt-2'
							>
								{pedir.isPending ? t('password.forgotSending') : t('password.forgotSubmit')}
							</Button>

							<Link
								to='/login'
								className='mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-text'
							>
								<ArrowLeft size={13} /> {t('password.backToLogin')}
							</Link>
						</form>
					)}
				</div>
			</div>

			<BrandPanel />
		</div>
	)
}
