import { useQueryClient } from '@tanstack/react-query'
import { Check, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Field, Select, TextArea } from '@/features/job-form/fields'
import { ReadOnlyNotice } from '@/components/read-only-notice'
import { RequireCapability } from '@/components/require-capability'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card, FormGrid } from '@/ui/page'

const SIZES = [
	'1 - 10 funcionários',
	'11 - 20 funcionários',
	'21 - 50 funcionários',
	'51 - 100 funcionários',
	'101 - 500 funcionários',
	'500+ funcionários',
]

const COUNTRIES = ['Brasil', 'Portugal', 'Espanha', 'Alemanha', 'Outros']

interface CompanyDraft {
	companyName: string
	companyBio: string
	companySize: string
	companyWebsite: string
	companyCountry: string
	companyState: string
	companyCity: string
	/** URL do logo — o campo no banco tem o nome com typo (`companLogo`). */
	companLogo: string
}

/**
 * Dados da empresa.
 *
 * Não é cadastro burocrático: `companyName`, `companyBio` e o logo aparecem
 * na página de carreiras e nos e-mails que o candidato recebe. Empresa com
 * bio vazia manda convite assinado por um nome que ninguém reconhece — por
 * isso a bio fica aqui e não escondida atrás de "avançado".
 */
export function CompanySection({ company }: { company?: Record<string, unknown> }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const update = empresa.usePatchCompanies()
	const { can } = useCapabilities()
	const editable = can('settings:write')

	const [draft, setDraft] = useState<CompanyDraft>({
		companyName: '',
		companyBio: '',
		companySize: '',
		companyWebsite: '',
		companyCountry: 'Brasil',
		companyState: '',
		companyCity: '',
		companLogo: '',
	})
	const [hydrated, setHydrated] = useState(false)
	const [enviandoLogo, setEnviandoLogo] = useState(false)
	const arquivo = useRef<HTMLInputElement>(null)
	const [saved, setSaved] = useState(false)
	const [error, setError] = useState(false)

	useEffect(() => {
		if (hydrated || !company) return
		const str = (key: string) => (typeof company[key] === 'string' ? (company[key] as string) : '')
		setDraft({
			companyName: str('companyName'),
			companyBio: str('companyBio'),
			companySize: str('companySize'),
			companyWebsite: str('companyWebsite'),
			companyCountry: str('companyCountry') || 'Brasil',
			companyState: str('companyState'),
			companyCity: str('companyCity'),
			companLogo: str('companLogo'),
		})
		setHydrated(true)
	}, [company, hydrated])

	const set = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }))

	async function save() {
		setError(false)
		setSaved(false)
		try {
			await update.mutateAsync({ data: draft as never })
			setSaved(true)
			await queryClient.invalidateQueries()
		} catch {
			setError(true)
		}
	}

	/*
	 * Upload de verdade, mesmo caminho do avatar do perfil.
	 *
	 * A tela dizia "em breve" porque `POST /companies/logo` é multipart e o
	 * contrato não descreve o corpo — o SDK gera a mutation com payload `void`.
	 * `POST /upload/file` já existia, devolve a URL pronta, e o PATCH da empresa
	 * passou a aceitar o campo. Uma peça a menos.
	 *
	 * A troca só vale depois de Salvar, como todo o resto do formulário: subir a
	 * imagem e gravar na hora faria o logo ser a única coisa da tela sem volta.
	 */
	async function escolherLogo(file: File) {
		setEnviandoLogo(true)
		setError(false)
		try {
			const form = new FormData()
			form.append('file', file)
			const resposta = await empresa.postUploadFile({ folder: 'logos' }, { body: form })
			set('companLogo', resposta.data.url)
		} catch {
			setError(true)
		} finally {
			setEnviandoLogo(false)
		}
	}

	// o rascunho manda enquanto se edita; o valor salvo é o fallback
	const logo = draft.companLogo || (typeof company?.companLogo === 'string' ? company.companLogo : null)

	return (
		<Card title={t('settings.company')} description={t('settings.companyHint')}>
			<ReadOnlyNotice capability='settings:write' />
			{/*
			 * `fieldset` desabilita tudo que está dentro, sem propagar `disabled`
			 * por cada campo — e sem depender de alguém lembrar do próximo. Só
			 * esconder o Salvar deixava o formulário editável: a pessoa digitava,
			 * procurava o botão e não achava.
			 */}
			<fieldset
				disabled={!editable}
				className={cn('flex flex-col gap-4', !editable && 'mt-3 opacity-70')}
			>
				<div className='flex items-center gap-3'>
					{logo ? (
						<img
							src={logo}
							alt=''
							width={56}
							height={56}
							className='h-14 w-14 shrink-0 rounded-xl border border-border object-cover'
						/>
					) : (
						<span className='font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-[16px] font-semibold text-lime-fg'>
							{(draft.companyName || '—').slice(0, 2).toUpperCase()}
						</span>
					)}
					<div>
						<p className='text-[12px] text-text-2'>{t('settings.logoHint')}</p>
						<div className='mt-1.5 flex items-center gap-2'>
							<input
								ref={arquivo}
								type='file'
								accept='image/png,image/jpeg,image/webp'
								className='hidden'
								onChange={(event) => {
									const file = event.target.files?.[0]
									if (file) void escolherLogo(file)
									// permite reescolher o MESMO arquivo depois de um erro
									event.target.value = ''
								}}
							/>
							<Button
								variant='secondary'
								size='sm'
								disabled={!editable || enviandoLogo}
								onClick={() => arquivo.current?.click()}
							>
								<Upload size={12} />
								{enviandoLogo ? t('settings.logoUploading') : t('settings.logoChoose')}
							</Button>
							{draft.companLogo && (
								<Button
									variant='ghost'
									size='sm'
									disabled={!editable || enviandoLogo}
									onClick={() => set('companLogo', '')}
								>
									{t('settings.logoRemove')}
								</Button>
							)}
						</div>
					</div>
				</div>

				<FormGrid columns={3}>
					<Field label={t('settings.companyName')}>
						<input
							value={draft.companyName}
							onChange={(e) => set('companyName', e.target.value)}
							className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						/>
					</Field>
					<Field label={t('settings.site')} hint={t('settings.siteHint')}>
						<input
							value={draft.companyWebsite}
							onChange={(e) => set('companyWebsite', e.target.value)}
							placeholder='https://'
							className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						/>
					</Field>
					<Field label={t('settings.size')}>
						<Select
							value={draft.companySize}
							onChange={(v) => set('companySize', v)}
							options={[
								{ value: '', label: t('settings.sizePlaceholder') },
								...SIZES.map((value) => ({ value, label: value })),
							]}
						/>
					</Field>

					<Field label={t('settings.country')}>
						<Select
							value={draft.companyCountry}
							onChange={(v) => set('companyCountry', v)}
							options={COUNTRIES.map((value) => ({ value, label: value }))}
						/>
					</Field>
					<Field label={t('settings.state')}>
						<input
							value={draft.companyState}
							onChange={(e) => set('companyState', e.target.value)}
							placeholder='SP'
							className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						/>
					</Field>
					<Field label={t('settings.city')}>
						<input
							value={draft.companyCity}
							onChange={(e) => set('companyCity', e.target.value)}
							className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						/>
					</Field>
				</FormGrid>

				<Field label={t('settings.bio')} hint={t('settings.bioHint')}>
					<TextArea rows={3} value={draft.companyBio} onChange={(v) => set('companyBio', v)} />
				</Field>

				{error && <p className='text-[12px] text-danger'>{t('jobConfig.saveError')}</p>}

				<div className='flex items-center gap-2'>
					<RequireCapability capability='settings:write'>
						<Button
							onClick={() => void save()}
							disabled={update.isPending || !draft.companyName.trim()}
						>
						{update.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
						</Button>
					</RequireCapability>
					{saved && (
						<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
							<Check size={13} /> {t('jobConfig.saved')}
						</span>
					)}
				</div>
			</fieldset>
		</Card>
	)
}
