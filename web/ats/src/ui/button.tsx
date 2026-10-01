import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[transform,box-shadow,border-color,background-color,filter] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px active:translate-y-0 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none',
	{
		variants: {
			variant: {
				primary: 'bg-lime text-lime-ink hover:shadow-[0_0_0_4px_rgba(205,251,18,0.22)] active:brightness-95',
				secondary: 'border border-border bg-card-alt text-text hover:border-lime-mid',
				ghost: 'text-text-2 hover:bg-hover hover:text-text',
				danger: 'bg-danger-soft text-danger hover:brightness-95',
			},
			size: {
				sm: 'h-7 px-2.5 text-[12px]',
				md: 'h-8 px-3 text-[13px]',
				lg: 'h-9 px-4 text-[13px]',
			},
		},
		defaultVariants: { variant: 'secondary', size: 'md' },
	},
)

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
