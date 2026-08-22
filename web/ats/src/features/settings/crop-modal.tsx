import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/button'

/**
 * Encaixe da imagem NA HORA do upload (o gesto do GitHub/YouTube): antes de
 * subir, a pessoa vê a MOLDURA DO TAMANHO FINAL e arrasta a imagem até o
 * recorte que quer. Subir primeiro e ajustar depois obrigava a adivinhar.
 *
 * Dois destinos, duas estratégias:
 * - `banner`: a imagem sobe INTEIRA e só a posição vertical (0–100) é salva —
 *   o portal renderiza a faixa em alturas diferentes por breakpoint, então o
 *   recorte destrutivo jogaria fora pixels que outra altura usaria.
 * - `logo`: recorte REAL em canvas — o logo é exibido quadrado em todo lugar,
 *   e subir um retângulo pra "cortar com CSS" era o que fazia o preview
 *   aparecer esticado. O arquivo já sai quadrado daqui.
 */
export interface CropResult {
	file: File
	/** Só para banner: fatia vertical escolhida (0–100). */
	position?: number
}

const BANNER_ASPECT = 1400 / 400

export function CropModal({
	kind,
	file,
	busy,
	onConfirm,
	onCancel,
}: {
	kind: 'banner' | 'logo'
	file: File
	busy: boolean
	onConfirm: (result: CropResult) => void
	onCancel: () => void
}) {
	const { t } = useTranslation()
	const url = useMemo(() => URL.createObjectURL(file), [file])
	useEffect(() => () => URL.revokeObjectURL(url), [url])

	const frameRef = useRef<HTMLDivElement>(null)
	const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
	/** Deslocamento do excedente, 0–100 em cada eixo (50 = centro). */
	const [offset, setOffset] = useState({ x: 50, y: 50 })
	const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null)

	const frameAspect = kind === 'banner' ? BANNER_ASPECT : 1

	/*
	 * Quanto a imagem excede a moldura em cada eixo (px renderizados). É isso
	 * que o drag percorre — 1 pixel de dedo = 1 pixel de imagem, sem fator
	 * arbitrário de sensibilidade.
	 */
	function overflow() {
		const frame = frameRef.current
		if (!frame || !natural) return { x: 0, y: 0, renderW: 0, renderH: 0 }
		const fw = frame.clientWidth
		const fh = frame.clientHeight
		const imgAspect = natural.w / natural.h
		const renderW = imgAspect > fw / fh ? fh * imgAspect : fw
		const renderH = imgAspect > fw / fh ? fh : fw / imgAspect
		return { x: renderW - fw, y: renderH - fh, renderW, renderH }
	}

	function startDrag(event: PointerEvent<HTMLDivElement>) {
		event.currentTarget.setPointerCapture(event.pointerId)
		drag.current = { x: event.clientX, y: event.clientY, start: offset }
	}

	function moveDrag(event: PointerEvent<HTMLDivElement>) {
		if (!drag.current) return
		const over = overflow()
		const next = { ...drag.current.start }
		if (over.x > 1) {
			next.x = Math.min(
				100,
				Math.max(0, drag.current.start.x - ((event.clientX - drag.current.x) / over.x) * 100),
			)
		}
		if (over.y > 1) {
			next.y = Math.min(
				100,
				Math.max(0, drag.current.start.y - ((event.clientY - drag.current.y) / over.y) * 100),
			)
		}
		setOffset(next)
	}

	function endDrag() {
		drag.current = null
	}

	async function confirm() {
		if (kind === 'banner') {
			onConfirm({ file, position: Math.round(offset.y) })
			return
		}
		/*
		 * Logo: recorte quadrado real. O quadrado recortado é o MAIOR possível
		 * (menor dimensão da imagem), deslocado pelo offset escolhido — mesmo
		 * enquadramento que a pessoa viu na moldura.
		 */
		const image = new Image()
		image.src = url
		await new Promise((resolve, reject) => {
			image.onload = resolve
			image.onerror = reject
		})
		const side = Math.min(image.naturalWidth, image.naturalHeight)
		const sx = ((image.naturalWidth - side) * offset.x) / 100
		const sy = ((image.naturalHeight - side) * offset.y) / 100
		const canvas = document.createElement('canvas')
		canvas.width = side
		canvas.height = side
		canvas.getContext('2d')!.drawImage(image, sx, sy, side, side, 0, 0, side, side)
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		)
		if (!blob) return
		onConfirm({ file: new File([blob], 'logo.png', { type: 'image/png' }) })
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
			<div className='w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-pop'>
				<h3 className='text-[14px] font-semibold'>{t(`portal.crop.${kind}Title`)}</h3>
				<p className='mt-0.5 text-[12px] text-text-2'>{t('portal.crop.hint')}</p>

				<div
					ref={frameRef}
					onPointerDown={startDrag}
					onPointerMove={moveDrag}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					className='relative mx-auto mt-3 touch-none select-none overflow-hidden rounded-lg border border-border bg-bg'
					style={{
						aspectRatio: String(frameAspect),
						cursor: 'grab',
						width: kind === 'logo' ? '260px' : '100%',
					}}
				>
					<img
						src={url}
						alt=''
						draggable={false}
						onLoad={(event) =>
							setNatural({
								w: event.currentTarget.naturalWidth,
								h: event.currentTarget.naturalHeight,
							})
						}
						className='h-full w-full object-cover'
						style={{ objectPosition: `${offset.x}% ${offset.y}%` }}
					/>
				</div>

				<div className='mt-4 flex justify-end gap-2'>
					<Button variant='secondary' size='sm' onClick={onCancel} disabled={busy}>
						{t('portal.crop.cancel')}
					</Button>
					<Button size='sm' onClick={() => void confirm()} disabled={busy}>
						{busy && <Loader2 size={12} className='animate-spin' />}
						{t('portal.crop.confirm')}
					</Button>
				</div>
			</div>
		</div>
	)
}
