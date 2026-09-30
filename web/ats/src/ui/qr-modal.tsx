import { Download, Printer, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/button'

/**
 * QR Code de um link da vaga.
 *
 * Existe porque divulgar vaga não acontece só na tela: cartaz na portaria,
 * balcão de loja, feira de recrutamento. Copiar o endereço não serve no papel
 * — o pedido veio de cliente (MRV) e a v1 ganhou o mesmo botão.
 *
 * Duas saídas, e as duas importam: **PNG em 1024px**, porque material impresso
 * feito com print de tela sai borrado; e **imprimir**, numa janela própria com
 * QR + vaga + endereço, porque mandar imprimir a tela do ATS dá folha inútil.
 *
 * O endereço aparece em texto embaixo do código: quem não escaneia ainda
 * consegue digitar.
 */
function sanitizeFilename(value: string): string {
	const normalizado = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return normalizado || 'vaga'
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;')
}

export function QrModal({
	url,
	jobName,
	/** Que link é este — "Página da vaga", "Link da entrevista"… */
	linkLabel,
	onClose,
}: {
	url: string
	jobName: string
	linkLabel: string
	onClose: () => void
}) {
	const { t } = useTranslation()
	const [dataUrl, setDataUrl] = useState('')
	const [falhou, setFalhou] = useState(false)

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	useEffect(() => {
		let ativo = true
		setDataUrl('')
		setFalhou(false)
		// 1024px: o mesmo arquivo serve na tela e no cartaz A3
		QRCode.toDataURL(url, { width: 1024, margin: 4, color: { dark: '#000000', light: '#ffffff' } })
			.then((gerado) => ativo && setDataUrl(gerado))
			.catch(() => ativo && setFalhou(true))
		return () => {
			ativo = false
		}
	}, [url])

	function baixar() {
		if (!dataUrl) return
		const link = document.createElement('a')
		link.href = dataUrl
		link.download = `qr-code-${sanitizeFilename(jobName)}.png`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
	}

	function imprimir() {
		if (!dataUrl) return
		const janela = window.open('', '_blank')
		if (!janela) return
		janela.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(jobName)}</title>
<style>
@page { margin: 24mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; text-align: center; }
main { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
img { width: min(80vw, 520px); height: auto; image-rendering: crisp-edges; }
h1 { margin: 0; font-size: 28px; line-height: 1.25; }
p { margin: 0; max-width: 680px; overflow-wrap: anywhere; font-size: 16px; line-height: 1.5; }
</style></head><body><main>
<img src="${dataUrl}" alt="${escapeHtml(t('share.qrAlt'))}" />
<h1>${escapeHtml(jobName)}</h1>
<p>${escapeHtml(url)}</p>
</main><script>window.addEventListener('load', () => { window.print(); window.close(); });</script>
</body></html>`)
		janela.document.close()
	}

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
			onClick={onClose}
		>
			<div
				role='dialog'
				aria-modal='true'
				className='w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='flex items-start justify-between gap-3'>
					<div className='min-w-0'>
						<h2 className='text-[15px] font-medium'>{t('share.qrTitle')}</h2>
						<p className='mt-1 text-[12.5px] leading-relaxed text-text-2'>
							{t('share.qrDescription')}
						</p>
					</div>
					<button
						type='button'
						onClick={onClose}
						aria-label={t('filters.cancel')}
						className='shrink-0 rounded-md p-1 text-text-2 transition-colors hover:bg-hover hover:text-text'
					>
						<X size={14} />
					</button>
				</div>

				<div className='mt-4 flex justify-center'>
					{/* fundo branco fixo: no tema escuro um QR invertido não escaneia */}
					<div className='rounded-xl border border-border bg-white p-3'>
						{dataUrl ? (
							<img src={dataUrl} alt={t('share.qrAlt')} className='h-52 w-52' />
						) : (
							<div className='flex h-52 w-52 items-center justify-center px-3 text-center text-[12px] text-neutral-500'>
								{falhou ? t('share.qrFailed') : t('jobs.loading')}
							</div>
						)}
					</div>
				</div>

				<div className='mt-4 text-center'>
					<p className='truncate text-[13px] font-medium'>{jobName}</p>
					<p className='mt-0.5 text-[11.5px] text-text-2'>{linkLabel}</p>
					{/* o endereço em texto é o plano B de quem não escaneia */}
					<p className='mt-2 break-all text-[11px] text-text-2'>{url}</p>
				</div>

				<div className='mt-5 flex justify-end gap-2'>
					<Button variant='secondary' onClick={baixar} disabled={!dataUrl}>
						<Download size={13} /> {t('share.qrDownload')}
					</Button>
					<Button onClick={imprimir} disabled={!dataUrl}>
						<Printer size={13} /> {t('share.qrPrint')}
					</Button>
				</div>
			</div>
		</div>
	)
}
