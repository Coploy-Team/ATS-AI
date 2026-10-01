import { Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Aviso com janela de desfazer.
 *
 * O undo aqui é honesto: a ação **não é executada** enquanto o timer corre. É
 * diferente de "executar e depois reverter" — reverter uma reprovação não
 * desfaz o e-mail que já saiu para o candidato, e o recrutador acharia que
 * desfez. Quem chama passa a ação; ela roda quando o timer expira ou quando o
 * componente é desmontado (navegar para fora confirma, não cancela).
 */
export function UndoToast({
	message,
	seconds = 8,
	onCommit,
	onUndo,
	onClose,
}: {
	message: string
	seconds?: number
	onCommit: () => void
	onUndo?: () => void
	onClose: () => void
}) {
	const { t } = useTranslation()
	const [left, setLeft] = useState(seconds)

	useEffect(() => {
		const tick = setInterval(() => setLeft((value) => value - 1), 1000)
		const timer = setTimeout(() => {
			onCommit()
			onClose()
		}, seconds * 1000)
		return () => {
			clearInterval(tick)
			clearTimeout(timer)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<div className='fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg'>
			<span className='text-[12.5px]'>{message}</span>
			<span className='font-num text-[11.5px] text-muted'>{Math.max(left, 0)}s</span>
			<button
				onClick={() => {
					onUndo?.()
					onClose()
				}}
				className='inline-flex items-center gap-1.5 rounded-lg border border-lime bg-lime-soft px-2.5 py-1 text-[12px] font-medium text-lime-fg transition-colors hover:bg-lime-soft/70'
			>
				<Undo2 size={13} /> {t('common.undo')}
			</button>
		</div>
	)
}
