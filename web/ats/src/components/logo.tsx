import coployDark from '@/assets/coploy_dark.png'
import coployLight from '@/assets/coploy_logo.png'
import { cn } from '@/lib/cn'

/**
 * Logo real da Coploy (mesmos assets do dashboard). Troca por tema via CSS
 * (duas imgs, uma escondida) pra não depender de estado JS no boot.
 */
export function Logo({ className }: { className?: string }) {
	return (
		<span className={cn('inline-flex shrink-0', className)}>
			<img src={coployLight} alt='Coploy' className='block h-full w-auto dark:hidden' />
			<img src={coployDark} alt='Coploy' className='hidden h-full w-auto dark:block' />
		</span>
	)
}
