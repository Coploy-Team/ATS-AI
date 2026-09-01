import { useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * Identidade do cliente no topbar: logo da empresa quando existe, senão
 * iniciais sobre lime-soft. Logo quebrado cai no fallback (URLs antigas do
 * Storage podem 404).
 */
export function CompanyBadge({ name, logoUrl }: { name?: string; logoUrl?: string | null }) {
	const [broken, setBroken] = useState(false)
	const showLogo = Boolean(logoUrl) && !broken

	const initials =
		(name ?? '')
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('') || '—'

	return (
		<span className='flex min-w-0 items-center gap-2'>
			<span
				className={cn(
					'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg',
					showLogo ? 'bg-surface ring-1 ring-border' : 'bg-lime-soft',
				)}
			>
				{showLogo ? (
					<img
						src={logoUrl ?? ''}
						alt={name ?? ''}
						onError={() => setBroken(true)}
						className='h-full w-full object-contain'
					/>
				) : (
					<span className='text-[10px] font-semibold text-lime-fg'>{initials}</span>
				)}
			</span>
			<span className='truncate text-[13px] font-medium text-text'>{name ?? ''}</span>
		</span>
	)
}
