import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className='font-num rounded border border-border bg-card-alt px-1 py-px text-[10px] text-muted'>
			{children}
		</kbd>
	)
}
