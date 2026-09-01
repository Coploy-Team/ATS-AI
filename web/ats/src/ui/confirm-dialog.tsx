import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/ui/button'

/**
 * Confirmação com CONSEQUÊNCIA escrita.
 *
 * A regra vem do modal de publicar vaga: repetir a pergunta sem dizer o que
 * acontece só treina a pessoa a clicar em "sim". Por isso `description` é
 * obrigatório — um diálogo que diz apenas "tem certeza?" é ruído com custo de
 * clique.
 *
 * Extraído porque a casca (overlay, `role='dialog'`, fechar no fundo, Esc) já
 * estava copiada em três telas, e a quarta cópia seria a que esqueceria o Esc.
 */
export function ConfirmDialog({
	title,
	description,
	confirmLabel,
	tone = 'default',
	pending = false,
	onConfirm,
	onCancel,
	children,
}: {
	title: string
	/** O que acontece de fato — não "tem certeza?". */
	description: string
	confirmLabel: string
	/** `danger` para ação destrutiva; muda só o botão de confirmar. */
	tone?: 'default' | 'danger'
	pending?: boolean
	onConfirm: () => void
	onCancel: () => void
	children?: ReactNode
}) {
	const { t } = useTranslation()

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onCancel])

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
			onClick={onCancel}
		>
			<div
				role='dialog'
				aria-modal='true'
				className='w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg'
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className='text-[15px] font-medium'>{title}</h2>
				<p className='mt-1 text-[12.5px] leading-relaxed text-text-2'>{description}</p>

				{children}

				<div className='mt-5 flex justify-end gap-2'>
					<Button variant='secondary' onClick={onCancel}>
						{t('filters.cancel')}
					</Button>
					<Button
						variant={tone === 'danger' ? 'danger' : 'primary'}
						onClick={onConfirm}
						disabled={pending}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	)
}
