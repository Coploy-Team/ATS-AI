import { Check, LogOut, Monitor, Moon, Pencil, Sun, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNavigate } from '@tanstack/react-router'

import { empresa } from '@coploy/sdk/react'

import { PasswordCard } from './password-card'

import { getAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'

const LANGUAGES = [
	{ value: 'pt', label: 'Português' },
	{ value: 'en', label: 'English' },
]

const THEMES = [
	{ value: 'light', icon: Sun },
	{ value: 'dark', icon: Moon },
	{ value: 'system', icon: Monitor },
] as const

/**
 * Perfil de quem está logado.
 *
 * Duas coisas que só existem aqui: saber COM QUAL CONTA você está (crítico
 * para quem alterna entre empresas ou usa a conta de outra pessoa por
 * engano) e as preferências que hoje só viviam em botõezinhos da topbar,
 * onde ninguém procura por elas.
 *
 * Edita nome, foto e telefone. Isso não existia porque a rota que salvava era
 * da superfície CANDIDATO (`POST /auth/update-profile`, cujo payload é
 * currículo) e o ATS não pode chamá-la — então a tela mostrava um cadastro que
 * não dava pra mudar. Abriu-se `PATCH /profile` no contrato, em vez de furar a
 * superfície: gap de API é PR no contrato.
 *
 * Cargo, empresa e nível de acesso continuam fora daqui: quem define é quem
 * administra a conta. Ninguém se promove sozinho.
 */
/** Nome e sobrenome — "Henrique Olinda Cabral Amorim" é "HA", não "HE". */
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/** Rótulo fixo acima do campo: placeholder some ao digitar e deixa de explicar. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className='flex flex-col gap-1'>
			<span className='text-[11.5px] font-medium text-text-2'>{label}</span>
			{children}
		</label>
	)
}

export function ProfilePage() {
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const { data, isLoading, refetch } = empresa.useGetProfile()
	const { data: companyData } = empresa.useGetCompanies()

	/**
	 * `user` é a PESSOA; `company` é a empresa. Até o contrato 0.17 a rota
	 * devolvia o bloco `user` preenchido com nome e logo da EMPRESA — daí o
	 * perfil mostrar "Tecnologia S/A" enquanto a topbar mostrava as iniciais
	 * da pessoa. O fallback mantém a tela viva contra core anterior.
	 */
	const payload = data?.data as
		| {
				user?: Record<string, unknown>
				company?: { id?: string; name?: string | null; logoUrl?: string | null }
		  }
		| undefined
	const user = payload?.user
	const legacyCompany = (companyData?.data as { company?: Record<string, unknown> } | undefined)
		?.company
	const companyName =
		payload?.company?.name ??
		(typeof legacyCompany?.companyName === 'string' ? legacyCompany.companyName : null)

	const [theme, setTheme] = useState(() => localStorage.getItem('coploy.ats.theme') ?? 'system')
	const [copied, setCopied] = useState(false)

	const save = empresa.usePatchProfile()
	const [uploading, setUploading] = useState(false)
	const fileInput = useRef<HTMLInputElement>(null)

	/*
	 * Upload de verdade, não campo de URL.
	 *
	 * Pedir "URL da foto" empurra para o usuário um trabalho que é nosso: ele
	 * teria de hospedar a imagem em algum lugar antes. `POST /upload/file` já
	 * existia (é o mesmo caminho da mídia de vaga) e devolve a URL pronta.
	 */
	async function pickPhoto(file: File) {
		setUploading(true)
		try {
			const form = new FormData()
			form.append('file', file)
			const response = await empresa.postUploadFile(
				{ folder: 'avatars' },
				{ body: form },
			)
			setDraftPhoto(response.data.url)
		} finally {
			setUploading(false)
		}
	}
	/*
	 * Otimista com volta atrás: a caixa responde no clique (marcar e esperar o
	 * servidor faz parecer travado), e volta ao estado anterior se a gravação
	 * falhar — em vez de mostrar desligado e continuar mandando e-mail.
	 */
	const [avisoLocal, setAvisoLocal] = useState<boolean | null>(null)
	const recebeAviso =
		avisoLocal ?? (user?.notifyOnInterviewFinish as boolean | undefined) ?? true

	async function mudarAviso(valor: boolean) {
		setAvisoLocal(valor)
		try {
			await save.mutateAsync({ data: { notifyOnInterviewFinish: valor } })
			await refetch()
			setAvisoLocal(null)
		} catch {
			setAvisoLocal(!valor)
		}
	}

	const [editing, setEditing] = useState(false)
	const [draftName, setDraftName] = useState('')
	const [draftPhoto, setDraftPhoto] = useState('')
	const [draftPhone, setDraftPhone] = useState('')

	function startEditing() {
		setDraftName(String(user?.name ?? ''))
		setDraftPhoto(String(user?.avatarUrl ?? ''))
		setDraftPhone(String(user?.phoneNumber ?? ''))
		setEditing(true)
	}

	async function persist() {
		await save.mutateAsync({
			data: {
				name: draftName.trim(),
				// campo vazio = remover a foto, e `null` é como o contrato diz isso
				photoUrl: draftPhoto.trim() || null,
				phoneNumber: draftPhone.trim() || null,
			},
		})
		await refetch()
		setEditing(false)
	}

	function applyTheme(next: string) {
		setTheme(next)
		localStorage.setItem('coploy.ats.theme', next)
		const dark =
			next === 'dark' ||
			(next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
		document.documentElement.classList.toggle('dark', dark)
	}

	const name = String(user?.name ?? '—')
	const email = String(user?.email ?? '')

	return (
		<Page title={t('profile.title')} subtitle={t('profile.subtitle')}>
			<div className='grid gap-4 xl:grid-cols-2'>
				<Card title={t('profile.account')}>
					{isLoading ? (
						<div className='h-20 animate-pulse rounded-lg bg-card-alt' />
					) : (
						<>
							<div className='flex items-start gap-3'>
								{typeof user?.avatarUrl === 'string' && user.avatarUrl ? (
									<img
										src={user.avatarUrl}
										alt=''
										width={48}
										height={48}
										className='h-12 w-12 shrink-0 rounded-full object-cover'
									/>
								) : (
									<span className='font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime-soft text-[16px] font-semibold text-lime-fg'>
										{initialsOf(name)}
									</span>
								)}
								<div className='min-w-0'>
									<p className='truncate text-[14px] font-medium'>{name}</p>
									<button
										onClick={() => {
											void navigator.clipboard.writeText(email)
											setCopied(true)
											setTimeout(() => setCopied(false), 1600)
										}}
										className='inline-flex items-center gap-1.5 text-[12px] text-text-2 transition-colors hover:text-text'
									>
										{email}
										{copied && <Check size={12} className='text-lime-fg' />}
									</button>
								</div>
							</div>

							{/* qual empresa: quem alterna entre contas precisa disto na cara */}
							{companyName && (
								<p className='mt-3 border-t border-border-soft pt-3 text-[12px] text-text-2'>
									{t('profile.workingAt')}{' '}
									<span className='font-medium text-text'>{companyName}</span>
								</p>
							)}

							{editing && (
								<div className='mt-4 flex flex-col gap-2 border-t border-border-soft pt-3'>
									<Field label={t('profile.name')}>
										<input
											value={draftName}
											onChange={(event) => setDraftName(event.target.value)}
											className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
										/>
									</Field>
									<Field label={t('profile.photo')}>
										<div className='flex flex-wrap items-center gap-2'>
											{draftPhoto && (
												<img
													src={draftPhoto}
													alt=''
													width={36}
													height={36}
													className='h-9 w-9 shrink-0 rounded-full object-cover'
												/>
											)}
											<input
												ref={fileInput}
												type='file'
												accept='image/*'
												className='hidden'
												onChange={(event) => {
													const file = event.target.files?.[0]
													if (file) void pickPhoto(file)
													// permite reescolher o MESMO arquivo depois de um erro
													event.target.value = ''
												}}
											/>
											<Button
												variant='secondary'
												onClick={() => fileInput.current?.click()}
												disabled={uploading}
											>
												<Upload size={13} />
												{uploading ? t('profile.uploading') : t('profile.choosePhoto')}
											</Button>
											{draftPhoto && (
												<button
													onClick={() => setDraftPhoto('')}
													className='text-[12px] text-muted transition-colors hover:text-danger'
												>
													{t('profile.removePhoto')}
												</button>
											)}
										</div>
									</Field>
									<Field label={t('profile.phone')}>
										<input
											value={draftPhone}
											onChange={(event) => setDraftPhone(event.target.value)}
											className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
										/>
									</Field>
									{save.isError && (
										<p className='text-[12px] text-danger'>{t('profile.saveFailed')}</p>
									)}
								</div>
							)}

							<div className='mt-4 flex flex-wrap gap-2'>
								{editing ? (
									<>
										<Button
											onClick={() => void persist()}
											disabled={save.isPending || !draftName.trim()}
										>
											{save.isPending ? t('profile.saving') : t('profile.save')}
										</Button>
										<Button variant='secondary' onClick={() => setEditing(false)}>
											{t('filters.cancel')}
										</Button>
									</>
								) : (
									<Button variant='secondary' onClick={startEditing}>
										<Pencil size={13} /> {t('profile.edit')}
									</Button>
								)}
								<Button
									variant='secondary'
									onClick={() => {
										void getAuth()
											.logout()
											.then(() => navigate({ to: '/login' }))
									}}
								>
									<LogOut size={13} /> {t('profile.signOut')}
								</Button>
							</div>
						</>
					)}
				</Card>

				{/* senha entre identidade e preferências: é sobre a conta, não sobre gosto */}
				<PasswordCard />

				<Card title={t('profile.preferences')} description={t('profile.preferencesHint')}>
					<div className='flex flex-col gap-4'>
						<div>
							<p className='mb-1.5 text-[12px] font-medium text-text-2'>
								{t('profile.language')}
							</p>
							<div className='flex gap-1.5'>
								{LANGUAGES.map((language) => (
									<button
										key={language.value}
										onClick={() => void i18n.changeLanguage(language.value)}
										className={cn(
											'rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors',
											i18n.language.startsWith(language.value)
												? 'border-lime bg-lime-soft text-lime-fg'
												: 'border-border text-text-2 hover:bg-hover',
										)}
									>
										{language.label}
									</button>
								))}
							</div>
						</div>

						{/*
						 * Recusar o aviso mora AQUI, no perfil de cada um.
						 *
						 * Antes não havia como recusar: a saída em uso era pôr a pessoa
						 * na lista negra do Postmark, que cala todos os e-mails daquele
						 * endereço — inclusive redefinição de senha e alerta de prazo.
						 * Silenciar um aviso não pode custar o acesso à conta.
						 */}
						<div>
							<p className='mb-1.5 text-[12px] font-medium text-text-2'>
								{t('profile.notifications')}
							</p>
							<label className='flex cursor-pointer items-start gap-2.5'>
								<input
									type='checkbox'
									checked={recebeAviso}
									disabled={save.isPending}
									onChange={(event) => void mudarAviso(event.target.checked)}
									className='mt-0.5 h-4 w-4 accent-lime-mid'
								/>
								<span className='text-[12.5px] leading-relaxed'>
									{t('profile.notifyInterviewFinish')}
									<span className='block text-[11.5px] text-text-2'>
										{t('profile.notifyInterviewFinishHint')}
									</span>
								</span>
							</label>
						</div>

						<div>
							<p className='mb-1.5 text-[12px] font-medium text-text-2'>{t('profile.theme')}</p>
							<div className='flex gap-1.5'>
								{THEMES.map((option) => {
									const Icon = option.icon
									return (
										<button
											key={option.value}
											onClick={() => applyTheme(option.value)}
											className={cn(
												'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors',
												theme === option.value
													? 'border-lime bg-lime-soft text-lime-fg'
													: 'border-border text-text-2 hover:bg-hover',
											)}
										>
											<Icon size={13} /> {t(`profile.themes.${option.value}`)}
										</button>
									)
								})}
							</div>
						</div>
					</div>
				</Card>
			</div>
		</Page>
	)
}
