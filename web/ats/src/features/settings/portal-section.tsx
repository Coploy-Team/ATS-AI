import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Image as ImageIcon, Link2, Loader2 } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'
import { empresa as empresaFetch } from '@coploy/sdk'

import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { MarkdownEditor } from '@/ui/markdown-editor'
import { Card } from '@/ui/page'

import { CropModal, type CropResult } from './crop-modal'

/**
 * Portal de vagas — a cara pública da empresa (ADR-007).
 *
 * O que se configura aqui é o que o CANDIDATO vê no portal (`web/careers`):
 * banner, logo, cor. A prévia ao lado é a régua de honestidade — mostra o
 * hero com o que está salvo, do jeito que o candidato encontra.
 *
 * Cor entra por PUT (upsert: a primeira cor salva CRIA o portal); imagem
 * entra por multipart no `/job-portal/media`. São os fluxos que a v1 já
 * tinha — a tela é que não existia no v2.
 */
export function PortalSection({ companyId }: { companyId: string | undefined }) {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const queryClient = useQueryClient()

	const { data } = empresa.useGetJobPortal({ query: { retry: false } })
	const portal =
		data && data.status === 200
			? (data.data as { jobPortal?: Record<string, unknown> }).jobPortal
			: undefined

	const [primaryColor, setPrimaryColor] = useState<string | null>(null)
	/*
	 * Recorte vertical do banner (0–100). O banner quase nunca tem a proporção
	 * da faixa — o gesto de ARRASTAR a imagem na prévia escolhe qual fatia
	 * aparece (como na capa do YouTube). `null` = ainda não mexeu nesta sessão.
	 */
	const [bannerPos, setBannerPos] = useState<number | null>(null)
	/** Links sociais em edição — null = ainda espelhando o que está salvo. */
	const [socialDraft, setSocialDraft] = useState<Record<string, string> | null>(null)
	const [socialSaved, setSocialSaved] = useState(false)
	const [aboutDraft, setAboutDraft] = useState<string | null>(null)
	const [videoDraft, setVideoDraft] = useState<string | null>(null)
	const [aboutSaved, setAboutSaved] = useState(false)
	const dragRef = useRef<{ startY: number; startPos: number } | null>(null)
	const [saved, setSaved] = useState(false)
	const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null)
	const [uploadError, setUploadError] = useState(false)
	/** Arquivo escolhido aguardando encaixe no modal — nada sobe antes do OK. */
	const [pendingCrop, setPendingCrop] = useState<{ kind: 'logo' | 'banner'; file: File } | null>(
		null,
	)
	const logoInput = useRef<HTMLInputElement>(null)
	const bannerInput = useRef<HTMLInputElement>(null)

	const update = empresa.usePutJobPortal({
		mutation: {
			onSuccess: () => {
				setSaved(true)
				setTimeout(() => setSaved(false), 2000)
				void queryClient.invalidateQueries()
			},
		},
	})

	const color = primaryColor ?? ((portal?.primaryColor as string | undefined) || '#CDFB12')
	const bannerUrl = (portal?.bannerUrl as string | undefined) || ''
	const logoUrl = (portal?.logoUrl as string | undefined) || ''
	const position = bannerPos ?? ((portal?.bannerPosition as number | undefined) ?? 50)
	const savedLinks = (portal?.socialLinks as Record<string, string | null> | undefined) ?? {}
	const about = aboutDraft ?? ((portal?.about as string | null | undefined) ?? '')
	const videoUrl = videoDraft ?? ((portal?.videoUrl as string | null | undefined) ?? '')
	// 'website' saiu do formulário: o site oficial vive na tela Empresa e o
	// portal público já cai nele quando este campo está vazio — dois campos
	// "Site" na mesma página só confundiam (relato do teste). O valor antigo
	// segue aceito pelo backend por compat.
	const SOCIAL_KINDS = ['linkedin', 'instagram', 'facebook', 'glassdoor'] as const
	const social =
		socialDraft ??
		Object.fromEntries(SOCIAL_KINDS.map((kind) => [kind, savedLinks[kind] ?? '']))
	const readOnly = !can('settings:write')

	function startDrag(event: PointerEvent<HTMLDivElement>) {
		if (!bannerUrl || readOnly) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { startY: event.clientY, startPos: position }
	}

	function moveDrag(event: PointerEvent<HTMLDivElement>) {
		if (!dragRef.current) return
		// arrastar a IMAGEM pra baixo revela o topo dela → posição diminui
		const delta = event.clientY - dragRef.current.startY
		const next = Math.min(100, Math.max(0, dragRef.current.startPos - delta * 0.6))
		setBannerPos(next)
	}

	function endDrag() {
		if (!dragRef.current) return
		dragRef.current = null
		// salva no soltar — arrastar é o ajuste, soltar é a decisão
		update.mutate({ data: { bannerPosition: Math.round(bannerPos ?? position) } })
	}

	// edição open expõe o portal em VITE_CAREERS_URL; no SaaS o link vem do Motor
	const portalBase = (import.meta.env.VITE_CAREERS_URL as string | undefined)?.replace(/\/+$/, '')
	const portalUrl = portalBase && companyId ? `${portalBase}/${companyId}` : ''
	const [copied, setCopied] = useState(false)

	async function upload(kind: 'logo' | 'banner', result: CropResult) {
		setUploading(kind)
		setUploadError(false)
		try {
			const body = new FormData()
			body.append(kind, result.file)
			await empresaFetch.postJobPortalMedia({ body })
			// o encaixe escolhido no modal vale junto com a imagem
			if (kind === 'banner' && result.position !== undefined) {
				await empresaFetch.putJobPortal({ bannerPosition: result.position })
				setBannerPos(result.position)
			}
			setPendingCrop(null)
			void queryClient.invalidateQueries()
		} catch {
			setUploadError(true)
		} finally {
			setUploading(null)
		}
	}

	return (
		<Card title={t('portal.title')} description={t('portal.description')}>
			<fieldset disabled={readOnly} className='flex flex-col gap-4'>
				<div className='grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]'>
					<div className='flex flex-col gap-4'>
						{/* imagens */}
						<div className='grid gap-3 sm:grid-cols-2'>
							{(
								[
									{ kind: 'banner' as const, url: bannerUrl, input: bannerInput, hint: t('portal.bannerHint') },
									{ kind: 'logo' as const, url: logoUrl, input: logoInput, hint: t('portal.logoHint') },
								]
							).map(({ kind, url, input, hint }) => (
								<div key={kind} className='flex flex-col gap-1.5'>
									<span className='text-[12.5px] font-medium'>{t(`portal.${kind}`)}</span>
									<button
										type='button'
										onClick={() => input.current?.click()}
										className={
											'group relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface transition-colors hover:border-lime-mid ' +
											// o thumb tem a FORMA do destino: logo é quadrado no portal,
											// mostrá-lo esticado num retângulo aqui era mentir o resultado
											(kind === 'logo' ? 'h-24 w-24' : 'h-24')
										}
									>
										{url ? (
											<img
												src={url}
												alt=''
												className='h-full w-full object-cover'
												style={
													kind === 'banner'
														? { objectPosition: `50% ${position}%` }
														: undefined
												}
											/>
										) : (
											<span className='flex flex-col items-center gap-1 text-[11.5px] text-muted'>
												<ImageIcon size={16} />
												{t('portal.upload')}
											</span>
										)}
										{uploading === kind && (
											<span className='absolute inset-0 flex items-center justify-center bg-black/40'>
												<Loader2 size={16} className='animate-spin text-white' />
											</span>
										)}
									</button>
									<span className='text-[11px] text-muted'>{hint}</span>
									<input
										ref={input}
										type='file'
										accept='image/png,image/jpeg'
										className='hidden'
										onChange={(event) => {
											const file = event.target.files?.[0]
											// o arquivo vai pro MODAL DE ENCAIXE, não direto pro upload
											if (file) setPendingCrop({ kind, file })
											event.target.value = ''
										}}
									/>
								</div>
							))}
						</div>
						{uploadError && <p className='text-[12px] text-danger'>{t('portal.uploadError')}</p>}

						{/* cor */}
						<div className='flex flex-wrap items-end gap-3'>
							<label className='flex flex-col gap-1.5'>
								<span className='text-[12.5px] font-medium'>{t('portal.primaryColor')}</span>
								<span className='flex items-center gap-2'>
									<input
										type='color'
										value={color}
										onChange={(event) => setPrimaryColor(event.target.value)}
										className='h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1'
									/>
									<input
										value={color}
										onChange={(event) => setPrimaryColor(event.target.value)}
										className='font-num h-9 w-28 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
									/>
								</span>
							</label>
							<Button
								size='sm'
								disabled={update.isPending || primaryColor === null}
								onClick={() => update.mutate({ data: { primaryColor: color } })}
							>
								{update.isPending ? (
									<Loader2 size={12} className='animate-spin' />
								) : saved ? (
									<Check size={12} />
								) : null}
								{saved ? t('portal.saved') : t('portal.save')}
							</Button>
						</div>

						{/* redes da empresa: fecham a página da vaga no portal */}
						<div className='flex flex-col gap-1.5'>
							<span className='text-[12.5px] font-medium'>{t('portal.socialTitle')}</span>
							<span className='text-[11px] text-muted'>{t('portal.socialHint')}</span>
							<div className='grid gap-2 sm:grid-cols-2'>
								{SOCIAL_KINDS.map((kind) => (
									<label key={kind} className='flex items-center gap-2'>
										<span className='w-20 shrink-0 text-[12px] text-text-2'>
											{t(`portal.social.${kind}`)}
										</span>
										<input
											type='url'
											placeholder='https://…'
											value={social[kind] ?? ''}
											onChange={(event) =>
												setSocialDraft({ ...social, [kind]: event.target.value })
											}
											className='h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
										/>
									</label>
								))}
							</div>
							<Button
								size='sm'
								className='w-fit'
								disabled={update.isPending || socialDraft === null}
								onClick={() => {
									update.mutate(
										{ data: { socialLinks: social } },
										{
											onSuccess: () => {
												setSocialSaved(true)
												setTimeout(() => setSocialSaved(false), 2000)
											},
										},
									)
								}}
							>
								{socialSaved ? <Check size={12} /> : null}
								{socialSaved ? t('portal.saved') : t('portal.socialSave')}
							</Button>
						</div>

						{/* a empresa em texto e vídeo: o que a página da vaga mostra no fecho */}
						<div className='flex flex-col gap-1.5'>
							<span className='text-[12.5px] font-medium'>{t('portal.aboutTitle')}</span>
							<span className='text-[11px] text-muted'>{t('portal.aboutHint')}</span>
							<MarkdownEditor value={about} onChange={setAboutDraft} rows={6} />
							<label className='mt-1 flex items-center gap-2'>
								<span className='w-20 shrink-0 text-[12px] text-text-2'>{t('portal.videoLabel')}</span>
								<input
									type='url'
									placeholder='https://youtube.com/watch?v=…'
									value={videoUrl}
									onChange={(event) => setVideoDraft(event.target.value)}
									className='h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							</label>
							<span className='text-[11px] text-muted'>{t('portal.videoHint')}</span>
							<Button
								size='sm'
								className='w-fit'
								disabled={update.isPending || (aboutDraft === null && videoDraft === null)}
								onClick={() => {
									update.mutate(
										{ data: { about, videoUrl } },
										{
											onSuccess: () => {
												setAboutSaved(true)
												setTimeout(() => setAboutSaved(false), 2000)
											},
										},
									)
								}}
							>
								{aboutSaved ? <Check size={12} /> : null}
								{aboutSaved ? t('portal.saved') : t('portal.aboutSave')}
							</Button>
						</div>

						{/* endereço público */}
						{portalUrl && (
							<div className='flex flex-col gap-1.5'>
								<span className='text-[12.5px] font-medium'>{t('portal.address')}</span>
								<div className='flex flex-wrap items-center gap-2'>
									<input
										readOnly
										value={portalUrl}
										onFocus={(event) => event.currentTarget.select()}
										className='h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
									/>
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											void navigator.clipboard.writeText(portalUrl).then(() => {
												setCopied(true)
												setTimeout(() => setCopied(false), 2000)
											})
										}}
									>
										{copied ? <Check size={12} /> : <Link2 size={12} />}
										{copied ? t('portal.copied') : t('portal.copy')}
									</Button>
									<a
										href={portalUrl}
										target='_blank'
										rel='noreferrer'
										className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-text-2 transition-colors hover:bg-hover hover:text-text'
									>
										<ExternalLink size={12} /> {t('portal.open')}
									</a>
								</div>
							</div>
						)}
					</div>

					{/* prévia: o hero do portal com o que está salvo — a régua de honestidade */}
					<div className='flex flex-col gap-1.5'>
						<span className='text-[12.5px] font-medium'>{t('portal.preview')}</span>
						<div className='overflow-hidden rounded-xl border border-border bg-bg'>
							<div
								className='relative h-28 touch-none select-none'
								style={{ cursor: bannerUrl && !readOnly ? 'grab' : undefined }}
								onPointerDown={startDrag}
								onPointerMove={moveDrag}
								onPointerUp={endDrag}
								onPointerCancel={endDrag}
							>
								{bannerUrl ? (
									<img
										src={bannerUrl}
										alt=''
										draggable={false}
										className='h-full w-full object-cover'
										style={{ objectPosition: `50% ${position}%` }}
									/>
								) : (
									<div
										className='h-full w-full'
										style={{
											background: `linear-gradient(120deg, color-mix(in srgb, ${color} 88%, black), ${color}, color-mix(in srgb, ${color} 70%, white))`,
										}}
									/>
								)}
							</div>
							<div className='flex items-center gap-2.5 px-3 pb-3'>
								<span className='-mt-4 h-10 w-10 shrink-0 overflow-hidden rounded-lg border-2 border-bg bg-surface shadow-sm'>
									{logoUrl ? (
										<img src={logoUrl} alt='' className='h-full w-full object-cover' />
									) : (
										<span
											className='flex h-full w-full items-center justify-center text-[13px] font-semibold'
											style={{ background: color }}
										/>
									)}
								</span>
								<span className='mt-1 flex-1 text-[12px] font-medium'>{t('portal.previewCompany')}</span>
								<span
									className='mt-1 rounded-md px-2.5 py-1 text-[10.5px] font-medium'
									style={{ background: color, color: '#111318' }}
								>
									{t('portal.previewCta')}
								</span>
							</div>
						</div>
						<span className='text-[11px] text-muted'>{t('portal.previewHint')}</span>
					</div>
				</div>
			</fieldset>

			{pendingCrop && (
				<CropModal
					kind={pendingCrop.kind}
					file={pendingCrop.file}
					busy={uploading !== null}
					onConfirm={(result) => void upload(pendingCrop.kind, result)}
					onCancel={() => setPendingCrop(null)}
				/>
			)}
		</Card>
	)
}
