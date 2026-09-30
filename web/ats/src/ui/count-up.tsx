import { useEffect, useRef, useState } from 'react'

import { countUp } from '@/lib/motion'

/**
 * Número que CONTA até o valor (primitiva "contar", plano E).
 *
 * Um número que muda de valor sem transição parece um erro de render; um que
 * conta do anterior até o novo diz "isto mudou, e mudou tanto". Aceita
 * `format` para prefixo/sufixo (dias, %, R$) sem animar a string inteira.
 */
export function CountUp({
	value,
	format = (n) => String(n),
	className,
}: {
	value: number
	format?: (n: number) => string
	className?: string
}) {
	const [shown, setShown] = useState(value)
	const previous = useRef(value)
	useEffect(() => {
		const stop = countUp(previous.current, value, setShown)
		previous.current = value
		return stop
	}, [value])
	return <span className={className}>{format(shown)}</span>
}
