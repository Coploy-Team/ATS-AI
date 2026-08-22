import { Check, Mail, RotateCcw, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { ReadOnlyNotice } from '@/components/read-only-notice'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Page } from '@/ui/page'
import { Skeleton } from '@/ui/skeleton'

/**
 * O que o candidato recebe.
 *
 * ## O problema desta tela antes
 *
 * Era um formulário: dois campos e um botão salvar. Funcionava e não ajudava —
 * o cliente escrevia às cegas e só descobria o resultado quando um candidato
 * real recebia o e-mail. Sem exemplo do que escrever, sem ideia de como o texto
 * cai dentro do layout, sem saber no que as variáveis se transformam.
 *
 * ## O que resolve
 *
 * A prévia é o centro da tela, e é o e-mail DE VERDADE: vem dos mesmos
 * renderizadores que enviam, por `POST /companies/email-templates/{kind}/
 * preview`. Imitar o layout em CSS aqui seria mais fácil e criaria duas versões
 * do mesmo e-mail divergindo a cada ajuste — com a bonita sendo a falsa.
 *
 * Os textos prontos não são "temas": são **vozes**. Uma empresa de tecnologia e
 * uma transportadora não falam igual com o candidato, e escolher o tom é a
 * decisão real.
 */
type Kind = 'interview_invite' | 'rejection_feedback' | 'application_ack' | 'profile_request'

interface Template {
	kind: Kind
	subject: string
	body: string
	active: boolean
}

const KINDS: Kind[] = [
	'interview_invite',
	'rejection_feedback',
	'application_ack',
	'profile_request',
]

/** Só o assunto: o corpo carrega a promessa de resposta ao candidato. */
const SUBJECT_ONLY: Kind[] = ['application_ack']

const VOICES = ['direct', 'warm', 'formal'] as const
type Voice = (typeof VOICES)[number]

/**
 * Assunto longo é cortado na lista do celular — 45 é onde o iPhone corta em
 * retrato. Não é regra: é o ponto em que vale reescrever.
 */
const SUBJECT_COMFORT = 45

export function EmailTemplatesPage() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const editable = can('settings:write')

	const { data, isLoading, refetch } = empresa.useGetCompaniesEmailTemplates()
	const save = empresa.usePutCompaniesEmailTemplatesKind()
	const reset = empresa.useDeleteCompaniesEmailTemplatesKind()
	const preview = empresa.usePostCompaniesEmailTemplatesKindPreview()

	const payload = data?.data as { templates?: Template[]; variables?: string[] } | undefined
	const variables = payload?.variables ?? ['candidato', 'vaga', 'empresa', 'link']
	const configured = new Set((payload?.templates ?? []).map((item) => item.kind))

	const [kind, setKind] = useState<Kind>('interview_invite')
	const [subject, setSubject] = useState('')
	const [body, setBody] = useState('')
	const [saved, setSaved] = useState(false)
	const [confirmingReset, setConfirmingReset] = useState(false)
	const bodyRef = useRef<HTMLTextAreaElement>(null)
	/*
	 * A prévia cresce com o e-mail. Altura fixa cortava o rodapé — que é onde
	 * está o link da entrevista, justamente o que se quer conferir antes de
	 * mandar. Sem `allow-scripts` nada executa aqui dentro; `allow-same-origin`
	 * só nos deixa medir o conteúdo, que é HTML nosso.
	 */
	const frameRef = useRef<HTMLIFrameElement>(null)
	const [frameHeight, setFrameHeight] = useState(520)

	const current = payload?.templates?.find((item) => item.kind === kind)
	const subjectOnly = SUBJECT_ONLY.includes(kind)

	useEffect(() => {
		setSubject(current?.subject ?? '')
		setBody(current?.body ?? '')
		setSaved(false)
		// a chave é o tipo escolhido; `current` troca de identidade a cada refetch
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kind, payload])

	/*
	 * Prévia com respiro de 400ms: sem isso seria uma renderização por tecla —
	 * cara no servidor e pior na tela, que piscaria a cada letra.
	 */
	const { mutate: renderPreview } = preview
	useEffect(() => {
		const timer = setTimeout(() => {
			renderPreview({ kind, data: { subject, body } })
		}, 400)
		return () => clearTimeout(timer)
	}, [kind, subject, body, renderPreview])

	const rendered = preview.data?.data as
		| { subject: string; html: string; sample: { candidato: string; empresa: string } }
		| undefined

	/** Insere no CURSOR — anexar no fim obriga a recortar e colar. */
	function insertVariable(variable: string) {
		const token = `{{${variable}}}`
		const field = subjectOnly ? null : bodyRef.current
		if (!field) {
			setSubject((value) => `${value}${token}`)
			setSaved(false)
			return
		}
		const start = field.selectionStart ?? body.length
		const end = field.selectionEnd ?? body.length
		setBody(`${body.slice(0, start)}${token}${body.slice(end)}`)
		setSaved(false)
		requestAnimationFrame(() => {
			field.focus()
			field.setSelectionRange(start + token.length, start + token.length)
		})
	}

	function applyVoice(voice: Voice) {
		setSubject(t(`emails.voices.${kind}.${voice}.subject`))
		if (!subjectOnly) setBody(t(`emails.voices.${kind}.${voice}.body`))
		setSaved(false)
	}

	function fitPreview() {
		const document_ = frameRef.current?.contentDocument
		if (!document_) return
		setFrameHeight(Math.max(320, document_.documentElement.scrollHeight))
	}

	/**
	 * Volta ao texto que a Coploy escreveu.
	 *
	 * Apaga o override em vez de gravar a cópia padrão por cima: assim o e-mail
	 * volta a acompanhar as melhorias que fizermos no texto, em vez de congelar
	 * a versão de hoje na conta do cliente.
	 */
	async function restoreDefault() {
		await reset.mutateAsync({ kind })
		await refetch()
		setSubject('')
		setBody('')
		setConfirmingReset(false)
		setSaved(false)
	}

	async function persist() {
		await save.mutateAsync({
			kind,
			data: { subject: subject.trim(), body: subjectOnly ? current?.body || '—' : body.trim() },
		})
		await refetch()
		setSaved(true)
	}

	return (
		<Page title={t('emails.title')} subtitle={t('emails.subtitle')}>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'>
				<div className='flex min-w-0 flex-col gap-3'>
					{/* os quatro momentos em que falamos com o candidato, com o gatilho de cada um */}
					<div className='grid gap-2 sm:grid-cols-2'>
						{KINDS.map((item) => (
							<button
								key={item}
								onClick={() => setKind(item)}
								className={cn(
									'flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
									item === kind
										? 'border-lime bg-lime-soft'
										: 'border-border bg-card hover:bg-hover',
								)}
							>
								<span className='flex items-center gap-1.5 text-[12.5px] font-medium'>
									<Mail size={12} className='shrink-0' />
									{t(`emails.kinds.${item}`)}
									{configured.has(item) && (
										<span
											className='h-1.5 w-1.5 rounded-full bg-lime'
											title={t('emails.customized')}
										/>
									)}
								</span>
								<span className='text-[11px] leading-snug text-text-2'>
									{t(`emails.when.${item}`)}
								</span>
							</button>
						))}
					</div>

					{isLoading ? (
						<Skeleton className='h-64 w-full' />
					) : (
						<section className='flex flex-col gap-3 rounded-xl border border-border bg-card p-4'>
							<ReadOnlyNotice capability='settings:write' />
							{editable && (
								<div className='flex flex-wrap items-center gap-1.5'>
									<span className='text-[11.5px] text-muted'>{t('emails.startFrom')}</span>
									{VOICES.map((voice) => (
										<button
											key={voice}
											onClick={() => applyVoice(voice)}
											className='inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
										>
											<Wand2 size={11} /> {t(`emails.voiceNames.${voice}`)}
										</button>
									))}
								</div>
							)}

							<label className='flex flex-col gap-1'>
								<span className='flex items-center justify-between text-[11.5px] font-medium text-text-2'>
									{t('emails.subject')}
									{/* o contador só aparece quando passa do ponto: régua, não vigilância */}
									{subject.length > SUBJECT_COMFORT && (
										<span className='font-num text-[11px] text-amber'>
											{t('emails.subjectLong', { count: subject.length })}
										</span>
									)}
								</span>
								<input
									value={subject}
									onChange={(event) => {
										setSubject(event.target.value)
										setSaved(false)
									}}
									disabled={!editable}
									placeholder={t(`emails.placeholders.${kind}`)}
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							</label>

							{subjectOnly ? (
								<p className='rounded-lg border border-border border-l-[3px] border-l-amber bg-card px-2.5 py-2 text-[12px] leading-snug text-text-2'>
									{t('emails.subjectOnly')}
								</p>
							) : (
								<label className='flex flex-col gap-1'>
									<span className='text-[11.5px] font-medium text-text-2'>{t('emails.body')}</span>
									<textarea
										ref={bodyRef}
										value={body}
										onChange={(event) => {
											setBody(event.target.value)
											setSaved(false)
										}}
										disabled={!editable}
										rows={7}
										placeholder={t('emails.bodyPlaceholder')}
										className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed'
									/>
								</label>
							)}

							{editable && (
								<div className='flex flex-wrap items-center gap-1.5'>
									<span className='text-[11.5px] text-muted'>{t('emails.insert')}</span>
									{variables.map((variable) => (
										<button
											key={variable}
											onClick={() => insertVariable(variable)}
											title={t(`emails.variableHelp.${variable}`, { defaultValue: '' })}
											className='font-num rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2 transition-colors hover:bg-hover hover:text-text'
										>
											{`{{${variable}}}`}
										</button>
									))}
								</div>
							)}

							{editable && (
								<div className='flex flex-wrap items-center gap-2 border-t border-border-soft pt-3'>
									<Button
										onClick={() => void persist()}
										disabled={!subject.trim() || save.isPending}
									>
										{save.isPending ? t('emails.saving') : t('emails.save')}
									</Button>
									{configured.has(kind) && (
										<Button
											variant='secondary'
											onClick={() => {
												setSubject(current?.subject ?? '')
												setBody(current?.body ?? '')
												setSaved(false)
											}}
										>
											<RotateCcw size={12} /> {t('emails.revert')}
										</Button>
									)}
									{/*
									 * Só aparece quando existe texto do cliente para desfazer —
									 * oferecer "voltar ao padrão" a quem já está no padrão é
									 * botão que não faz nada.
									 */}
									{configured.has(kind) &&
										(confirmingReset ? (
											<span className='inline-flex items-center gap-1.5 text-[12px]'>
												<span className='text-text-2'>{t('emails.resetConfirm')}</span>
												<button
													onClick={() => void restoreDefault()}
													disabled={reset.isPending}
													className='rounded px-1.5 py-0.5 font-medium text-danger hover:bg-hover'
												>
													{t('emails.resetYes')}
												</button>
												<button
													onClick={() => setConfirmingReset(false)}
													className='rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-text'
												>
													{t('filters.cancel')}
												</button>
											</span>
										) : (
											<button
												onClick={() => setConfirmingReset(true)}
												className='text-[12px] text-muted underline-offset-2 transition-colors hover:text-text hover:underline'
											>
												{t('emails.resetToDefault')}
											</button>
										))}
									{saved && (
										<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
											<Check size={12} /> {t('emails.saved')}
										</span>
									)}
									{save.isError && (
										<span className='text-[12px] text-danger'>{t('emails.failed')}</span>
									)}
								</div>
							)}
						</section>
					)}
				</div>

				{/*
				 * A prévia como caixa de entrada. O assunto só existe de verdade ao
				 * lado do remetente — num campo de formulário ele é texto solto, e é
				 * ali que se decide se o e-mail vai ser aberto.
				 */}
				<section className='flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start'>
					<header className='border-b border-border-soft px-4 py-2.5'>
						<p className='text-[13px] font-medium'>{t('emails.previewTitle')}</p>
						<p className='mt-0.5 text-[11.5px] text-muted'>
							{t('emails.previewHint', { name: rendered?.sample.candidato ?? 'Ana Silva' })}
						</p>
					</header>

					<div className='flex flex-col gap-1 border-b border-border-soft bg-card-alt px-4 py-2.5 text-[11.5px]'>
						<span className='flex gap-2'>
							<span className='w-16 shrink-0 text-muted'>{t('emails.from')}</span>
							<span className='truncate text-text-2'>
								{rendered?.sample.empresa ?? '—'} · no-reply@coploy.io
							</span>
						</span>
						<span className='flex gap-2'>
							<span className='w-16 shrink-0 text-muted'>{t('emails.subjectShort')}</span>
							<span className='min-w-0 flex-1 truncate font-medium text-text'>
								{rendered?.subject ?? '—'}
							</span>
						</span>
					</div>

					{preview.isPending && !rendered ? (
						<Skeleton className='m-4 h-72' />
					) : (
						<div className='min-h-0 flex-1 overflow-y-auto bg-white'>
							<iframe
								ref={frameRef}
								title={t('emails.previewTitle')}
								srcDoc={rendered?.html ?? ''}
								onLoad={fitPreview}
								sandbox='allow-same-origin'
								style={{ height: frameHeight }}
								className='w-full border-0 bg-white'
								scrolling='no'
							/>
						</div>
					)}
				</section>
			</div>
		</Page>
	)
}
