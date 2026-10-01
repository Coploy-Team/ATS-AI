import { Bell, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'

/**
 * O sino, funcionando.
 *
 * Antes era um botão sem `onClick` com uma bolinha verde **fixa** ao lado:
 * sinalizava não-lidas o tempo todo, para sempre, e não abria nada. Isso é pior
 * que não ter sino — treina a pessoa a ignorar o indicador, e quando ele passar
 * a valer alguma coisa ninguém mais vai olhar.
 *
 * O dado já existia em `/companies/{companyId}/notifications`; faltava a tela.
 */
interface Notification {
	id: string
	title: string
	message: string
	read?: boolean
	status: boolean
	dateTime: string
	jobId?: string | null
}

function relativeTime(iso: string, language: string): string {
	const time = new Date(iso).getTime()
	if (Number.isNaN(time)) return ''
	const minutes = Math.round((Date.now() - time) / 60_000)
	const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
	if (minutes < 60) return format.format(-minutes, 'minute')
	if (minutes < 1440) return format.format(-Math.round(minutes / 60), 'hour')
	return format.format(-Math.round(minutes / 1440), 'day')
}

export function NotificationsMenu({ companyId }: { companyId: string }) {
	const { t, i18n } = useTranslation()
	const [open, setOpen] = useState(false)
	const wrapper = useRef<HTMLDivElement>(null)

	const { data, refetch } = empresa.useGetCompaniesCompanyIdNotifications(
		companyId,
		undefined,
		{ query: { enabled: Boolean(companyId) } },
	)
	const markAllRead = empresa.usePatchCompaniesCompanyIdNotificationsReadAll()

	const notifications = ((data?.data as { notifications?: Notification[] } | undefined)
		?.notifications ?? []) as Notification[]
	/* `read` é o campo novo; `status` é o legado. Um deles marca lido. */
	const unread = notifications.filter((item) => !(item.read ?? item.status))

	useEffect(() => {
		if (!open) return
		function onClickOutside(event: MouseEvent) {
			if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
		}
		function onEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onClickOutside)
		document.addEventListener('keydown', onEscape)
		return () => {
			document.removeEventListener('mousedown', onClickOutside)
			document.removeEventListener('keydown', onEscape)
		}
	}, [open])

	async function markAll() {
		await markAllRead.mutateAsync({ companyId })
		await refetch()
	}

	return (
		<div ref={wrapper} className='relative'>
			<button
				onClick={() => setOpen((current) => !current)}
				aria-label={t('topbar.notifications')}
				aria-expanded={open}
				className='relative flex h-8 w-8 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-hover hover:text-text'
			>
				<Bell size={15} />
				{/* o ponto só existe quando há algo por ler — antes era decoração */}
				{unread.length > 0 && (
					<span className='absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-lime' />
				)}
			</button>

			{open && (
				<div className='absolute right-0 top-10 z-50 w-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-lg'>
					<header className='flex items-center gap-2 border-b border-border-soft px-3 py-2'>
						<span className='flex-1 text-[12.5px] font-medium'>{t('topbar.notifications')}</span>
						{unread.length > 0 && (
							<button
								onClick={() => void markAll()}
								disabled={markAllRead.isPending}
								className='inline-flex items-center gap-1 text-[11.5px] text-lime-fg transition-opacity hover:opacity-80'
							>
								<Check size={11} /> {t('notifications.markAll')}
							</button>
						)}
					</header>

					<div className='max-h-[60vh] overflow-y-auto'>
						{notifications.length === 0 && (
							<p className='px-3 py-8 text-center text-[12px] text-muted'>
								{t('notifications.empty')}
							</p>
						)}

						{notifications.slice(0, 20).map((item) => {
							const isRead = item.read ?? item.status
							return (
								<div
									key={item.id}
									className={cn(
										'border-b border-border-soft px-3 py-2.5 last:border-0',
										!isRead && 'bg-lime-soft/30',
									)}
								>
									<div className='flex items-start gap-2'>
										{!isRead && (
											<span className='mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime' />
										)}
										<div className='min-w-0 flex-1'>
											<p className='text-[12.5px] font-medium'>{item.title}</p>
											<p className='mt-0.5 text-[11.5px] leading-snug text-text-2'>
												{item.message}
											</p>
											<p className='mt-1 text-[10.5px] text-muted'>
												{relativeTime(item.dateTime, i18n.language)}
											</p>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
