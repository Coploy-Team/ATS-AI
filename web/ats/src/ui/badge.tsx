import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

/**
 * Badge redesenhado (feedback do protótipo v1: outline oco com dot ficou
 * feio). Padrão: pill de preenchimento tonal suave, sem borda, weight 500.
 */
const badgeVariants = cva(
	'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
	{
		variants: {
			tone: {
				lime: 'bg-lime-soft text-lime-fg',
				neutral: 'bg-card-alt text-text-2',
				amber: 'bg-amber-soft text-amber',
				danger: 'bg-danger-soft text-danger',
			},
		},
		defaultVariants: { tone: 'neutral' },
	},
)

export interface BadgeProps
	extends HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
