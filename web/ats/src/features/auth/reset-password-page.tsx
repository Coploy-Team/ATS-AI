import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Logo } from '@/components/logo'
import { getAuth } from '@/lib/auth'
import { Button } from '@/ui/button'

import { BrandPanel } from './login-page'

const MIN_LENGTH = 8

function fraqueza(senha: string): string | null {
	if (senha.length < MIN_LENGTH) return 'minLength'
	if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha)) return 'case'
	if (!/\d/.test(senha)) return 'digit'
	return null
}

/**
 * Criar a senha nova, com o código que veio no e-mail.
 *
 * O código é do Firebase (uso único, 1 hora) mas a tela é nossa: antes o link
 * levava à página hospedada do Firebase, em inglês, sem a marca, e a pessoa
 * voltava para o produto por conta própria.
 *
 * O código é conferido ANTES de mostrar o formulário. Deixar alguém escolher
 * senha, confirmar e só então descobrir que o link expirou é o pior momento
 * possível para dar a notícia.
 */
export function ResetPasswordPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()

	const [estado, setEstado] = useState<'verificando' | 'valido' | 'invalido' | 'semCodigo'>(
		'verificando',
	)
	const [email, setEmail] = useState<string | null>(null)
	const [nova, setNova] = useState('')
	const [confirmacao, setConfirmacao] = useState('')
	const [salvando, setSalvando] = useState(false)
	const [erro, setErro] = useState<string | null>(null)

	/*
	 * O Firebase manda `oobCode`; aceito `code` também porque é o nome curto que
	 * as pessoas usam ao montar o link à mão em teste.
	 */
	const codigo = new URLSearchParams(window.location.search).get('oobCode')
		|| new URLSearchParams(window.location.search).get('code')

	useEffect(() => {
		if (!codigo) {
			setEstado('semCodigo')
			return
		}
		let ativo = true
		getAuth()
			.verifyPasswordResetCode(codigo)
			.then((conta) => {
				if (!ativo) return
				setEmail(conta)
				setEstado('valido')
			})
			.catch(() => {
				if (ativo) setEstado('invalido')
			})
		return () => {
			ativo = false
		}
	}, [codigo])

	const problema = nova ? fraqueza(nova) : null
	const naoConfere = confirmacao.length > 0 && nova !== confirmacao
	const podeSalvar = !problema && !naoConfere && nova.length > 0 && confirmacao.length > 0

	async function salvar(event: FormEvent) {
		event.preventDefault()
		if (!codigo) return
		setErro(null)
		setSalvando(true)
		try {
			await getAuth().confirmPasswordReset(codigo, nova)
			/*
			 * Entra direto: a pessoa acabou de provar que é dona da conta e de
			 * escolher a senha. Mandá-la ao login para digitar o que digitou há um
			 * segundo é cerimônia sem função.
			 */
			if (email) {
				try {
					await getAuth().login(email, nova)
					await navigate({ to: '/dashboard' })
					return
				} catch {
					/* login automático falhou: o caminho manual continua valendo */
				}
			}
			await navigate({ to: '/login' })
		} catch {
			// só sobra código expirado/já usado — o resto foi validado antes
			setEstado('invalido')
		} finally {
			setSalvando(false)
		}
	}

	const voltar = (
		<Link
			to='/esqueci-senha'
			className='inline-flex items-center gap-1.5 text-[12.5px] font-medium text-lime-fg hover:underline'
		>
			<ArrowLeft size={13} /> {t('password.forgotTitle')}
		</Link>
	)

	return (
		<div className='grid min-h-screen bg-bg lg:grid-cols-2'>
			<div className='flex items-center justify-center px-4 py-10'>
				<div className='w-full max-w-sm'>
					<div className='mb-6 flex flex-col items-start gap-3'>
						<Logo className='h-11' />
						<div>
							<h1 className='text-[22px]'>{t('password.resetTitle')}</h1>
							{estado === 'valido' && (
								<p className='mt-1 text-[13px] leading-relaxed text-text-2'>
									{email
										? t('password.resetHint', { email })
										: t('password.resetHintNoEmail')}
								</p>
							)}
						</div>
					</div>

					{estado === 'verificando' && (
						<p className='text-[12.5px] text-muted'>{t('password.checking')}</p>
					)}

					{estado === 'semCodigo' && (
						<div className='flex flex-col gap-4'>
							<p className='rounded-lg bg-amber-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-amber'>
								{t('password.resetMissingCode')}
							</p>
							{voltar}
						</div>
					)}

					{estado === 'invalido' && (
						<div className='flex flex-col gap-4'>
							<p className='rounded-lg bg-amber-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-amber'>
								{t('password.resetInvalid')}
							</p>
							{voltar}
						</div>
					)}

					{estado === 'valido' && (
						<form onSubmit={salvar} className='flex flex-col gap-3'>
							<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
								{t('password.new')}
								<input
									type='password'
									required
									autoFocus
									autoComplete='new-password'
									value={nova}
									onChange={(event) => setNova(event.target.value)}
									className='h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text'
								/>
								<span className='text-[11px] font-normal text-muted'>
									{t('password.rules', { min: MIN_LENGTH })}
								</span>
							</label>
							{problema && <p className='text-[11.5px] text-amber'>{t(`password.${problema}`)}</p>}

							<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
								{t('password.confirm')}
								<input
									type='password'
									required
									autoComplete='new-password'
									value={confirmacao}
									onChange={(event) => setConfirmacao(event.target.value)}
									className='h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text'
								/>
							</label>
							{naoConfere && <p className='text-[11.5px] text-amber'>{t('password.mismatch')}</p>}

							{erro && <p className='text-[12px] text-danger'>{erro}</p>}

							<Button
								type='submit'
								variant='primary'
								size='lg'
								disabled={!podeSalvar || salvando}
								className='mt-2'
							>
								{salvando ? t('password.resetSaving') : t('password.resetSubmit')}
							</Button>
						</form>
					)}
				</div>
			</div>

			<BrandPanel />
		</div>
	)
}
