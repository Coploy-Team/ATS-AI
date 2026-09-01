import {
	Maximize2,
	PictureInPicture2,
	MicOff,
	Pause,
	Play,
	RotateCcw,
	RotateCw,
	Volume2,
	VolumeX,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { Popover, PopoverItem } from '@/ui/popover'

const RATES = [0.75, 1, 1.25, 1.5, 2]
/** Teto do palco: acima disso o vídeo empurra a análise para fora da tela. */
const STAGE_MAX_HEIGHT = 380
/** Pulo padrão de player: cobre "não entendi a última frase". */
const SKIP_SECONDS = 5

/** Quebra a legenda em linhas que cabem na largura do frame. */
function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(/\s+/)
	const lines: string[] = []
	let line = ''
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word
		if (ctx.measureText(candidate).width > maxWidth && line) {
			lines.push(line)
			line = word
		} else {
			line = candidate
		}
	}
	if (line) lines.push(line)
	// duas linhas bastam; mais que isso cobre o rosto na janela pequena
	return lines.slice(-2)
}

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Player da resposta do candidato.
 *
 * O `<video controls>` nativo não serve aqui: rever uma resposta é trabalho
 * de análise, não consumo passivo. Quem avalia precisa de velocidade (ouvir
 * 1,5× o que já entendeu), voltar 5s (a frase que passou) e legenda quando
 * existe — recursos que o player do dashboard já tinha e que eu tinha
 * jogado fora ao usar o controle nativo.
 *
 * Áudio sem vídeo usa o mesmo controle: a única diferença é o palco.
 */
export function VideoPlayer({
	src,
	kind,
	skipped,
	poster,
	captions,
	captionsByLanguage,
	preferredLanguage,
	audioFallback,
}: {
	src: string | null
	kind: 'video' | 'audio'
	skipped: boolean
	poster?: string | null
	/** Segmentos com marcação de tempo; habilitam o CC. */
	captions?: Array<{ start: number; end: number; text: string }> | null
	/** Traduções disponíveis (pt/en) — alimentam o seletor de idioma do CC. */
	captionsByLanguage?: Record<string, Array<{ start: number; end: number; text: string }>>
	/** Idioma escolhido para o resultado; a legenda segue por padrão. */
	preferredLanguage?: string | null
	/**
	 * Áudio da mesma resposta. Serve só para descobrir a duração quando o
	 * vídeo não a informa — ver `resolveDuration`.
	 */
	audioFallback?: string | null
}) {
	const { t } = useTranslation()
	const ref = useRef<HTMLVideoElement>(null)
	const [playing, setPlaying] = useState(false)
	const [muted, setMuted] = useState(false)
	const [current, setCurrent] = useState(0)
	const [duration, setDuration] = useState(0)
	const [rate, setRate] = useState(1)
	const [failed, setFailed] = useState(false)
	/** CC ligado por padrão quando existe: entender a resposta vem antes de ver. */
	const [showCaptions, setShowCaptions] = useState(true)
	/** Proporção real do arquivo; sem ela o palco esmaga gravação de celular. */
	const [ratio, setRatio] = useState<number | null>(null)
	/** `null` = legenda original (o idioma em que a pessoa respondeu). */
	const [captionLanguage, setCaptionLanguage] = useState<string | null>(null)
	/** Largura renderizada do palco — a legenda escala por ela. */
	const [stageWidth, setStageWidth] = useState(640)
	/**
	 * Picture-in-Picture.
	 *
	 * O vídeo sai do fluxo e vira janela flutuante: o recrutador ouve a resposta
	 * enquanto lê a transcrição, a análise e o currículo — hoje ele precisa
	 * parar o vídeo, rolar, voltar e dar play de novo. Enquanto está em PiP, o
	 * palco não fica um retângulo preto ocupando 360px: vira uma faixa fina, e
	 * TODO esse espaço volta para o conteúdo, que é o ponto da funcionalidade.
	 */
	const [pip, setPip] = useState(false)
	const pipSupported =
		typeof document !== 'undefined' && document.pictureInPictureEnabled === true
	const stageRef = useRef<HTMLDivElement>(null)

	/*
	 * Trocar o idioma do resultado troca a legenda junto. Ler a análise em
	 * português com a legenda em inglês é o tipo de meio-caminho que faz o
	 * recrutador achar que a tradução falhou.
	 */
	useEffect(() => {
		setCaptionLanguage(preferredLanguage ?? null)
	}, [preferredLanguage])

	// trocar de pergunta reinicia o player; sem isto o tempo da anterior fica
	useEffect(() => {
		setPlaying(false)
		setCurrent(0)
		setDuration(0)
		setRatio(null)
		setCaptionLanguage(null)
		setFailed(false)
	}, [src])

	/**
	 * Descobre a duração quando o arquivo não a informa.
	 *
	 * Gravação de webcam sai como WebM produzido por `MediaRecorder`, que não
	 * escreve a duração no header — o browser reporta `Infinity` ou 0 e a
	 * timeline trava em "0:00", sem barra utilizável.
	 *
	 * Duas saídas, nesta ordem: (1) forçar o decoder a varrer o arquivo com um
	 * salto absurdo, o que faz o browser calcular a duração real; (2) se ainda
	 * assim não vier, ler a duração do ÁUDIO da mesma resposta, que costuma
	 * vir de outro encoder e traz o header completo.
	 */
	function resolveDuration(el: HTMLVideoElement) {
		if (Number.isFinite(el.duration) && el.duration > 0) {
			setDuration(el.duration)
			return
		}

		const onProbe = () => {
			if (Number.isFinite(el.duration) && el.duration > 0) {
				setDuration(el.duration)
				el.currentTime = 0
				return
			}
			if (!audioFallback) return
			const probe = new Audio()
			probe.preload = 'metadata'
			probe.src = audioFallback
			probe.onloadedmetadata = () => {
				if (Number.isFinite(probe.duration) && probe.duration > 0) setDuration(probe.duration)
			}
		}

		el.addEventListener('timeupdate', onProbe, { once: true })
		el.currentTime = 1e101
	}

	useEffect(() => {
		if (ref.current) ref.current.playbackRate = rate
	}, [rate, src])

	// o usuário pode fechar a janela flutuante pelo próprio browser
	// quem fecha a janela pelo próprio browser também precisa parar a composição
	useEffect(() => {
		const pipVideo = pipVideoRef.current
		if (!pipVideo) return
		const onLeave = () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
			frameRef.current = null
			setPip(false)
		}
		pipVideo.addEventListener('leavepictureinpicture', onLeave)
		return () => pipVideo.removeEventListener('leavepictureinpicture', onLeave)
	}, [pip])

	// quem fecha a janela pelo próprio browser também precisa parar a composição
	useEffect(() => {
		const pipVideo = pipVideoRef.current
		if (!pipVideo) return
		const onLeave = () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
			frameRef.current = null
			setPip(false)
		}
		pipVideo.addEventListener('leavepictureinpicture', onLeave)
		return () => pipVideo.removeEventListener('leavepictureinpicture', onLeave)
	}, [pip])

	/**
	 * PiP com legenda desenhada no frame.
	 *
	 * ⚠️ O Chrome NÃO renderiza `<track>` na janela do PiP (o Safari renderiza).
	 * Ligar o track antes de abrir não resolve — testado, a janela sai sem
	 * legenda. O caminho que funciona é compor: um canvas desenha cada frame do
	 * vídeo com o texto da legenda por cima, `captureStream()` vira a fonte de
	 * um vídeo oculto, e é ELE que vai para a janela flutuante.
	 *
	 * O áudio continua saindo do elemento original (o stream do canvas é só
	 * vídeo), e por isso o vídeo da página segue tocando — apenas invisível.
	 * Exige CORS no bucket: sem `crossOrigin`, `drawImage` contamina o canvas e
	 * `captureStream` lança SecurityError. Verificado no Firebase Storage.
	 */
	const pipVideoRef = useRef<HTMLVideoElement | null>(null)
	const frameRef = useRef<number | null>(null)
	const captionRef = useRef<string | null>(null)

	function stopComposing() {
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
		frameRef.current = null
	}

	async function togglePip() {
		const el = ref.current
		if (!el) return

		if (document.pictureInPictureElement) {
			stopComposing()
			await document.exitPictureInPicture().catch(() => undefined)
			return
		}

		try {
			const canvas = document.createElement('canvas')
			canvas.width = el.videoWidth || 640
			canvas.height = el.videoHeight || 360
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('sem contexto 2d')

			const draw = () => {
				ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
				const text = captionRef.current
				if (text) {
					// tamanho relativo: a janela do PiP é redimensionável pelo usuário
					const size = Math.max(16, Math.round(canvas.width * 0.038))
					ctx.font = `600 ${size}px system-ui, sans-serif`
					ctx.textAlign = 'center'
					const lines = wrapCaption(ctx, text, canvas.width * 0.9)
					const lineHeight = size * 1.28
					const bottom = canvas.height - size * 0.9
					lines.forEach((line, index) => {
						const y = bottom - (lines.length - 1 - index) * lineHeight
						const width = ctx.measureText(line).width
						ctx.fillStyle = 'rgba(0,0,0,0.72)'
						ctx.fillRect(
							canvas.width / 2 - width / 2 - size * 0.35,
							y - size,
							width + size * 0.7,
							lineHeight,
						)
						ctx.fillStyle = '#fff'
						ctx.fillText(line, canvas.width / 2, y - size * 0.22)
					})
				}
				frameRef.current = requestAnimationFrame(draw)
			}
			draw()

			const pipVideo = pipVideoRef.current ?? document.createElement('video')
			pipVideoRef.current = pipVideo
			pipVideo.muted = true
			pipVideo.playsInline = true
			pipVideo.srcObject = canvas.captureStream(30)
			await pipVideo.play()
			await pipVideo.requestPictureInPicture()
			setPip(true)
			if (el.paused) void el.play().then(() => setPlaying(true))
		} catch {
			// browser recusou (sem gesto do usuário, CORS ausente): desfaz tudo
			stopComposing()
			setPip(Boolean(document.pictureInPictureElement))
		}
	}

	// acompanha o palco: trocar de pergunta ou redimensionar muda a escala
	useEffect(() => {
		const element = stageRef.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width))
		observer.observe(element)
		return () => observer.disconnect()
	}, [src])

	function toggle() {
		const el = ref.current
		if (!el) return
		if (el.paused) {
			void el.play()
			setPlaying(true)
		} else {
			el.pause()
			setPlaying(false)
		}
	}

	function skip(delta: number) {
		const el = ref.current
		if (!el) return
		el.currentTime = Math.min(Math.max(el.currentTime + delta, 0), duration || el.duration || 0)
	}

	function seek(event: React.MouseEvent<HTMLDivElement>) {
		const el = ref.current
		if (!el || !duration) return
		const rect = event.currentTarget.getBoundingClientRect()
		el.currentTime = ((event.clientX - rect.left) / rect.width) * duration
	}

	if (skipped) {
		return (
			<div className='flex aspect-video flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-6 text-center'>
				<MicOff size={20} className='text-amber' />
				<p className='text-[12px] font-medium text-amber'>{t('candidate.skippedTitle')}</p>
				<p className='text-[11px] text-muted'>{t('candidate.skippedHint')}</p>
			</div>
		)
	}

	if (!src || failed) {
		return (
			<div className='flex aspect-video items-center justify-center rounded-lg border border-border bg-surface'>
				<span className='inline-flex items-center gap-1.5 text-[12px] text-muted'>
					<Play size={14} /> {t(failed ? 'candidate.mediaFailed' : 'candidate.noMedia')}
				</span>
			</div>
		)
	}

	const progress = duration > 0 ? (current / duration) * 100 : 0
	const languages = Object.keys(captionsByLanguage ?? {})
	/*
	 * Memoizado de propósito: `?? []` cria um array NOVO a cada render, e o VTT
	 * abaixo depende dele. Sem estabilizar, cada render gerava uma blob URL e
	 * revogava a anterior — inclusive a que o `<track>` tinha acabado de
	 * receber, deixando a legenda nativa permanentemente em erro.
	 */
	const activeTrack = useMemo(
		() => (captionLanguage ? captionsByLanguage?.[captionLanguage] : null) ?? captions ?? [],
		[captionLanguage, captionsByLanguage, captions],
	)
	const hasCaptions = activeTrack.length > 0
	const activeCaption = hasCaptions
		? (activeTrack.find((segment) => current >= segment.start && current <= segment.end)?.text ??
			null)
		: null

	// o loop de composição lê a legenda atual sem reiniciar o rAF
	captionRef.current = showCaptions ? activeCaption : null


	/**
	 * Legenda dentro da janela flutuante.
	 *
	 * O overlay é HTML nosso — bonito, escala com o palco — mas vive na página,
	 * e a janela do PiP renderiza só o vídeo: em PiP a legenda ficava na tela
	 * vazia enquanto o rosto estava flutuando. A saída é o `<track>` NATIVO, que
	 * o browser desenha dentro da janela. Fica escondido no uso normal (o
	 * overlay é melhor ali) e liga sozinho ao entrar em PiP.
	 */
	return (
		/*
		 * A moldura NÃO é preta.
		 *
		 * O preto pertence ao palco, que tem a proporção do arquivo. Pintar a
		 * moldura de preto fazia a gravação vertical de celular aparecer como uma
		 * coluna estreita cercada por ~440px de tarja de cada lado — a moldura
		 * ocupa a largura do card, o vídeo não.
		 */
		/*
		 * `w-fit`: a moldura acompanha a largura do VÍDEO, não a do card.
		 *
		 * Esticada até a borda do card, ela deixava ~340px de vazio de cada lado
		 * de uma gravação vertical — o mesmo desperdício da tarja preta, só que
		 * em cinza. O piso de 380px existe pra barra de controles (velocidade,
		 * CC, volume) não se espremer quando o vídeo é estreito.
		 */
		<div
			className={cn(
				'mx-auto max-w-full overflow-hidden rounded-lg border border-border bg-card-alt',
				// horizontal preenche o card; vertical encolhe até o vídeo
				ratio !== null && ratio < 1 ? 'w-fit min-w-[min(100%,380px)]' : 'w-full',
			)}
		>
			{/*
			 * O palco segue a proporção REAL do arquivo, não 16:9 fixo. Entrevista
			 * gravada no celular é vertical: forçar widescreen enchia a tela de
			 * tarja preta, esmagava o rosto no meio e ainda comia o espaço da
			 * análise. Enquanto a proporção não é conhecida, um 16:9 provisório
			 * evita o salto de layout no primeiro frame.
			 */}
			<div
				/*
				 * Teto de altura sempre.
				 *
				 * `w-full` sem limite fazia um vídeo 4:3 numa coluna larga ocupar a
				 * tela inteira — o palco passava de 700px e a análise sumia abaixo da
				 * dobra. `maxWidth = ratio × teto` faz o palco preencher o card ATÉ
				 * bater o teto e, a partir daí, encolher junto, sem tarja preta.
				 */
				style={
					!pip && kind === 'video' && ratio
						? {
								aspectRatio: String(ratio),
								maxWidth: `${Math.round(STAGE_MAX_HEIGHT * ratio)}px`,
							}
						: undefined
				}
				className={cn(
					'relative mx-auto bg-black transition-all',
					pip
						? // em PiP o vídeo está flutuando: a faixa devolve a altura inteira
							'flex h-14 w-full items-center justify-center'
						: kind === 'audio'
							? 'h-24 w-full'
							: 'max-h-[380px] w-full',
				)}
			>
				<video
					ref={ref}
					src={src}
					// obrigatório: sem isto o canvas do PiP é contaminado e
					// `captureStream` lança SecurityError ao compor a legenda
					crossOrigin='anonymous'
					poster={poster ?? undefined}
					playsInline
					onClick={toggle}
					onTimeUpdate={(e) => {
						const time = e.currentTarget.currentTime
						// o salto de sondagem não pode virar posição na barra
						if (Number.isFinite(time) && time < 1e6) setCurrent(time)
					}}
					onLoadedMetadata={(e) => {
						const el = e.currentTarget
						if (el.videoWidth && el.videoHeight) setRatio(el.videoWidth / el.videoHeight)
						resolveDuration(el)
					}}
					onEnded={() => setPlaying(false)}
					onError={() => setFailed(true)}
					className={cn(
						'h-full w-full',
						kind === 'audio' ? 'opacity-0' : 'cursor-pointer object-contain',
						// em PiP o elemento é só âncora: quem exibe é a janela flutuante
						pip && 'pointer-events-none opacity-0',
					)}
				>
				</video>

				{/* legenda sobreposta, sincronizada pelo tempo corrente */}
				{showCaptions && activeCaption && !pip && (
					<div className='pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4'>
						{/*
						 * A legenda escala com o palco. Fixa em 12,5px, ela sumia num
						 * vídeo que ocupa o card inteiro e dominava num vertical estreito
						 * — o texto precisa ser legível na mesma proporção que o rosto.
						 */}
						<span
							style={{ fontSize: `clamp(12px, ${(stageWidth * 0.023).toFixed(1)}px, 19px)` }}
							className='max-w-[92%] rounded-md bg-black/75 px-2.5 py-1 text-center leading-snug text-white'
						>
							{activeCaption}
						</span>
					</div>
				)}

				{kind === 'audio' && (
					<div className='absolute inset-0 flex items-center justify-center gap-1'>
						{/* onda decorativa: áudio sem palco vira retângulo preto vazio */}
						{Array.from({ length: 32 }, (_, i) => (
							<span
								key={i}
								className={cn(
									'w-1 rounded-full bg-lime/60 transition-all',
									playing && 'animate-pulse',
								)}
								style={{
									height: `${12 + Math.abs(Math.sin(i * 0.7)) * 34}px`,
									animationDelay: `${i * 40}ms`,
								}}
							/>
						))}
					</div>
				)}

				{!playing && kind === 'video' && (
					<button
						onClick={toggle}
						aria-label={t('candidate.play')}
						className='absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40'
					>
						<span className='flex h-12 w-12 items-center justify-center rounded-full bg-lime text-lime-ink'>
							<Play size={16} className='ml-0.5' />
						</span>
					</button>
				)}
			</div>

			<div className='flex flex-col gap-1.5 bg-card px-3 py-2'>
				{/* trilha de progresso clicável — rever um trecho é o gesto mais
				    frequente de quem avalia */}
				<div
					onClick={seek}
					role='slider'
					aria-valuenow={Math.round(current)}
					aria-valuemin={0}
					aria-valuemax={Math.round(duration)}
					aria-label={t('candidate.seek')}
					tabIndex={0}
					className='group h-2 cursor-pointer rounded-full bg-data-track'
				>
					<div
						className='h-2 rounded-full bg-lime transition-[width] duration-100'
						style={{ width: `${progress}%` }}
					/>
				</div>

				<div className='flex items-center gap-1.5'>
					<button
						onClick={toggle}
						aria-label={t(playing ? 'candidate.pause' : 'candidate.play')}
						className='rounded p-1 text-text-2 transition-colors hover:text-text'
					>
						{playing ? <Pause size={15} /> : <Play size={15} />}
					</button>
					<button
						onClick={() => skip(-SKIP_SECONDS)}
						aria-label={t('candidate.rewind', { seconds: SKIP_SECONDS })}
						className='rounded p-1 text-text-2 transition-colors hover:text-text'
					>
						<RotateCcw size={14} />
					</button>
					<button
						onClick={() => skip(SKIP_SECONDS)}
						aria-label={t('candidate.forward', { seconds: SKIP_SECONDS })}
						className='rounded p-1 text-text-2 transition-colors hover:text-text'
					>
						<RotateCw size={14} />
					</button>

					<span className='font-num ml-1 text-[11.5px] text-muted'>
						{formatTime(current)} / {formatTime(duration)}
					</span>

					<div className='ml-auto flex items-center gap-1'>
						{/* velocidade e idioma saem da barra: cinco botões fixos +
						    um por idioma ocupavam metade da largura o tempo todo, e
						    num vídeo vertical a barra quebrava em três linhas */}
						<Popover
							label={t('candidate.speed')}
							trigger={<span className='font-num'>{rate}×</span>}
						>
							{(close) =>
								RATES.map((value) => (
									<PopoverItem
										key={value}
										active={rate === value}
										onClick={() => {
											setRate(value)
											close()
										}}
									>
										<span className='font-num'>{value}×</span>
									</PopoverItem>
								))
							}
						</Popover>

						{/* CC só aparece quando há legenda — botão morto ensina que o
						    recurso não funciona */}
						{hasCaptions && (
							<button
								onClick={() => setShowCaptions((v) => !v)}
								aria-label={t(showCaptions ? 'candidate.captionsOff' : 'candidate.captionsOn')}
								aria-pressed={showCaptions}
								className={cn(
									'rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors',
									showCaptions
										? 'border-lime bg-lime text-lime-ink'
										: 'border-border text-muted hover:text-text',
								)}
							>
								CC
							</button>
						)}

						{/*
						 * Idioma da legenda no popover: a lista crescia com cada
						 * tradução disponível e empurrava volume e tela cheia pra fora.
						 */}
						{showCaptions && languages.length > 0 && (
							<Popover
								label={t('candidate.captionLanguage')}
								trigger={
									<span className='uppercase'>
										{captionLanguage ? captionLanguage.split(/[-_]/)[0] : t('candidate.original')}
									</span>
								}
							>
								{(close) => (
									<>
										<PopoverItem
											active={captionLanguage === null}
											onClick={() => {
												setCaptionLanguage(null)
												close()
											}}
										>
											{t('candidate.captionOriginal')}
										</PopoverItem>
										{languages.map((language) => (
											<PopoverItem
												key={language}
												active={captionLanguage === language}
												onClick={() => {
													setCaptionLanguage(language)
													close()
												}}
											>
												<span className='uppercase'>{language.split(/[-_]/)[0]}</span>
											</PopoverItem>
										))}
									</>
								)}
							</Popover>
						)}

						<button
							onClick={() => {
								const el = ref.current
								if (!el) return
								el.muted = !el.muted
								setMuted(el.muted)
							}}
							aria-label={t(muted ? 'candidate.unmute' : 'candidate.mute')}
							className='rounded p-1 text-text-2 transition-colors hover:text-text'
						>
							{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
						</button>

						{/* PiP: ver e ler ao mesmo tempo, sem parar o vídeo para rolar */}
						{pipSupported && kind === 'video' && (
							<button
								onClick={() => void togglePip()}
								aria-pressed={pip}
								aria-label={t('candidate.pip')}
								title={t('candidate.pip')}
								className={cn(
									'rounded p-1 transition-colors',
									pip ? 'text-lime-fg' : 'text-text-2 hover:text-text',
								)}
							>
								<PictureInPicture2 size={14} />
							</button>
						)}

						{kind === 'video' && (
							<button
								onClick={() => void ref.current?.requestFullscreen?.()}
								aria-label={t('candidate.fullscreen')}
								className='rounded p-1 text-text-2 transition-colors hover:text-text'
							>
								<Maximize2 size={14} />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

