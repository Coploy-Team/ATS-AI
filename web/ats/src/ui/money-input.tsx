import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/**
 * Campo de dinheiro que lê o que se digita como CENTAVOS.
 *
 * O campo antigo era texto solto: os dígitos viravam reais inteiros, então
 * digitar "1200000" pensando em R$ 12.000,00 gravava **R$ 1.200.000,00**. Sem
 * separador na tela, o erro só aparecia depois de a oferta estar criada — que é
 * o pior momento possível para descobrir uma casa decimal a mais.
 *
 * Lendo como centavos, o número se forma da direita para a esquerda e a
 * formatação acontece a cada tecla: o que está escrito é exatamente o que vai
 * ser gravado. É o comportamento de caixa eletrônico, e é o que qualquer
 * brasileiro já espera de campo de valor.
 */
export function MoneyInput({
	valueMinor,
	onChange,
	currency = 'BRL',
	placeholder,
	className,
	'aria-label': ariaLabel,
}: {
	/** Valor em centavos — a unidade que a API guarda. */
	valueMinor: number | null
	onChange: (minor: number | null) => void
	currency?: string
	placeholder?: string
	className?: string
	'aria-label'?: string
}) {
	const { i18n } = useTranslation()

	const formatted =
		valueMinor === null
			? ''
			: new Intl.NumberFormat(i18n.language, {
					style: 'currency',
					currency,
					minimumFractionDigits: 2,
				}).format(valueMinor / 100)

	return (
		<input
			value={formatted}
			onChange={(event) => {
				const digits = event.target.value.replace(/\D/g, '')
				// vazio vira null, não zero: "não informei" e "R$ 0,00" são coisas diferentes
				onChange(digits ? Number(digits) : null)
			}}
			inputMode='numeric'
			placeholder={placeholder}
			aria-label={ariaLabel}
			className={cn(
				'font-num h-9 rounded-lg border border-border bg-surface px-2.5 text-right text-[12.5px]',
				className,
			)}
		/>
	)
}
