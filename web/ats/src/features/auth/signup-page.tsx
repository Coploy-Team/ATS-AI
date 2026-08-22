import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { publico } from '@coploy/sdk/react'

import { Check, X } from 'lucide-react'

import { Logo } from '@/components/logo'
import { getAuth, firebaseWebConfig } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

import { BrandPanel } from './login-page'

interface RegraDeSenha {
	id: string
	rotulo: string
	ok: (senha: string) => boolean
}

/**
 * A política de senha vem do projeto Firebase, em tempo de execução.
 *
 * Fixar a regra no código seria errado duas vezes: ela é configurável no
 * console (mudou lá, a tela mente até alguém lembrar de mexer aqui) e este
 * cliente é aberto — quem apontar para o próprio Firebase tem a política dele,
 * não a nossa.
 *
 * Foi exatamente por adivinhar que a tela dizia "mínimo de 6 caracteres"
 * enquanto o projeto exigia oito, com maiúscula, número e símbolo. O candidato
 * descobria a regra real sendo recusado — e recebendo um JSON cru na cara.
 */
async function buscarRegras(apiKey: string): Promise<RegraDeSenha[]> {
	const resposta = await fetch(
		`https://identitytoolkit.googleapis.com/v2/passwordPolicy?key=${apiKey}`,
	)
	if (!resposta.ok) throw new Error('política indisponível')
	const politica = (await resposta.json()) as {
		customStrengthOptions?: {
			minPasswordLength?: number
			containsLowercaseCharacter?: boolean
			containsUppercaseCharacter?: boolean
			containsNumericCharacter?: boolean
			containsNonAlphanumericCharacter?: boolean
		}
	}
	const opcoes = politica.customStrengthOptions ?? {}
	const minimo = opcoes.minPasswordLength ?? 6
	const regras: RegraDeSenha[] = [
		{ id: 'min', rotulo: `${minimo} caracteres`, ok: (senha) => senha.length >= minimo },
	]
	if (opcoes.containsLowercaseCharacter) {
		regras.push({ id: 'min%C3%BAscula', rotulo: 'uma letra minúscula', ok: (s) => /[a-z]/.test(s) })
	}
	if (opcoes.containsUppercaseCharacter) {
		regras.push({ id: 'maiuscula', rotulo: 'uma letra maiúscula', ok: (s) => /[A-Z]/.test(s) })
	}
	if (opcoes.containsNumericCharacter) {
		regras.push({ id: 'numero', rotulo: 'um número', ok: (s) => /[0-9]/.test(s) })
	}
	if (opcoes.containsNonAlphanumericCharacter) {
		regras.push({ id: 'simbolo', rotulo: 'um símbolo', ok: (s) => /[^A-Za-z0-9]/.test(s) })
	}
	return regras
}

/**
 * Traduz a falha do servidor.
 *
 * O `CoployApiError` carrega a mensagem do backend, que por sua vez repassa o
 * corpo do Identity Toolkit — e foi isso que apareceu na tela do Vitor: um
 * JSON aninhado com `PASSWORD_DOES_NOT_MEET_REQUIREMENTS` e `raw server
 * response`. Erro que exige interpretar JSON não é mensagem, é despejo.
 */
function traduzirErro(erro: unknown, generico: string): string {
	const bruto = erro instanceof Error ? erro.message : String(erro)
	if (/PASSWORD_DOES_NOT_MEET_REQUIREMENTS|Missing password requirements/i.test(bruto)) {
		return 'senha'
	}
	if (/EMAIL_EXISTS|already in use|já est[áa] em uso/i.test(bruto)) {
		return 'email'
	}
	if (/INVALID_EMAIL|Email inv[áa]lido/i.test(bruto)) {
		return 'emailInvalido'
	}
	return generico
}

/**
 * Criar conta da empresa.
 *
 * Até aqui o ATS mandava para o dashboard da v1 por link externo: quem queria
 * testar o produto saía dele antes de entrar. `POST /companies/free` já existia
 * no contrato como rota pública — faltava a tela.
 *
 * ## Cinco campos
 *
 * O backend aceita porte, segmento, site, objetivo e mais uma dúzia de campos
 * opcionais. Nenhum deles entra aqui: cadastro é o momento de MENOR paciência
 * do usuário, e tudo isso já tem lugar próprio em Configurações, onde ele
 * chega depois de ver o produto funcionando.
 *
 * ## Entra logado
 *
 * Criar a conta e cair na tela de login obrigaria a redigitar o que acabou de
 * ser digitado. A sessão é aberta com as mesmas credenciais logo após o 201.
 */
export function SignupPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const create = publico.usePostCompaniesFree()

	const [fullName, setFullName] = useState('')
	const [email, setEmail] = useState('')
	const [phone, setPhone] = useState('')
	const [companyName, setCompanyName] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [regras, setRegras] = useState<RegraDeSenha[]>([])

	useEffect(() => {
		buscarRegras(firebaseWebConfig.apiKey)
			.then(setRegras)
			// política indisponível não pode travar o cadastro: o servidor ainda
			// valida, e aí a mensagem traduzida cobre o caso
			.catch(() => setRegras([]))
	}, [])

	const senhaOk = regras.length === 0 || regras.every((regra) => regra.ok(password))

	async function handleSubmit(event: FormEvent) {
		event.preventDefault()
		setError(null)
		if (!senhaOk) {
			setError(t('signup.errors.senha'))
			return
		}
		setLoading(true)
		try {
			await create.mutateAsync({
				data: {
					user: { fullName, email, phone, password },
					company: { name: companyName },
				},
			})
			await getAuth().login(email, password)
			await navigate({ to: '/dashboard' })
		} catch (caught) {
			setError(t(`signup.errors.${traduzirErro(caught, 'generico')}`))
			setLoading(false)
		}
	}

	const field =
		'h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text transition-colors duration-150'

	return (
		<div className='grid min-h-screen bg-bg lg:grid-cols-2'>
			<div className='flex items-center justify-center px-4 py-10'>
				<div className='w-full max-w-sm'>
					<div className='mb-6 flex flex-col items-start gap-3'>
						<Logo className='h-11' />
						<div>
							<h1 className='text-[22px]'>{t('signup.title')}</h1>
							<p className='mt-1 text-[13px] text-text-2'>{t('signup.subtitle')}</p>
						</div>
					</div>

					<form onSubmit={handleSubmit} className='flex flex-col gap-3'>
						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('signup.fullName')}
							<input
								required
								autoComplete='name'
								value={fullName}
								onChange={(event) => setFullName(event.target.value)}
								className={field}
							/>
						</label>

						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('signup.companyName')}
							<input
								required
								autoComplete='organization'
								value={companyName}
								onChange={(event) => setCompanyName(event.target.value)}
								className={field}
							/>
						</label>

						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('signup.email')}
							<input
								type='email'
								required
								autoComplete='email'
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								className={field}
							/>
						</label>

						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('signup.phone')}
							<input
								required
								autoComplete='tel'
								value={phone}
								onChange={(event) => setPhone(event.target.value)}
								className={field}
							/>
						</label>

						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('signup.password')}
							<input
								type='password'
								required
								autoComplete='new-password'
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								className={field}
							/>
							{/*
							 * As regras aparecem ANTES de errar, e marcam sozinhas conforme
							 * a pessoa digita. A versão anterior mostrava uma frase fixa —
							 * e errada — e a regra real só chegava na recusa do servidor.
							 */}
							{regras.length > 0 && (
								<ul className='mt-0.5 flex flex-wrap gap-x-3 gap-y-1'>
									{regras.map((regra) => {
										const cumprida = regra.ok(password)
										return (
											<li
												key={regra.id}
												className={cn(
													'inline-flex items-center gap-1 text-[11px] font-normal transition-colors',
													cumprida ? 'text-lime-fg' : 'text-muted',
												)}
											>
												{cumprida ? <Check size={10} /> : <X size={10} />}
												{regra.rotulo}
											</li>
										)
									})}
								</ul>
							)}
						</label>

						{error && (
							<p className='rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger'>{error}</p>
						)}

						{/* mesma ênfase do login: ação principal é lime, não cinza */}
						<Button
							type='submit'
							variant='primary'
							size='lg'
							disabled={loading || !senhaOk}
							className='mt-2 w-full justify-center'
						>
							{loading ? t('signup.creating') : t('signup.submit')}
						</Button>
					</form>

					<p className='mt-5 text-[12px] text-text-2'>
						{t('signup.hasAccount')}{' '}
						<Link to='/login' className='font-medium text-lime-fg hover:underline'>
							{t('signup.signin')}
						</Link>
					</p>
				</div>
			</div>

			<BrandPanel />
		</div>
	)
}
