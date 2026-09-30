import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Único jeito sancionado de compor classes no web/ats (design-fundacao §5.3). */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
