import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode }) {
	return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>
}

export function Tooltip({
	label,
	side = 'right',
	children,
}: {
	label: string
	side?: 'top' | 'right' | 'bottom' | 'left'
	children: ReactNode
}) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Content
					side={side}
					sideOffset={6}
					className='z-50 rounded-md bg-text px-2 py-1 text-[11px] font-medium text-bg shadow-[var(--shadow-pop)]'
				>
					{label}
				</TooltipPrimitive.Content>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	)
}
