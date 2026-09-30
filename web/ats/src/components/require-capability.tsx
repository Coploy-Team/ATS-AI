import type { ReactNode } from 'react'

import { useCapabilities } from '@/lib/capabilities'

/**
 * Esconde o que o papel não permite.
 *
 * Existe para que a regra apareça UMA vez por bloco, em vez de um `can(...)`
 * solto em cada botão — que é como uma tela ganha três ações gateadas e a
 * quarta esquecida. Botão que o servidor negaria não deve aparecer: erro depois
 * do clique é pior que ausência antes dele.
 *
 * `fallback` é para quando sumir sem explicação confunde (uma tela inteira, por
 * exemplo). Para um botão, sumir basta.
 */
export function RequireCapability({
	capability,
	children,
	fallback = null,
}: {
	capability: string
	children: ReactNode
	fallback?: ReactNode
}) {
	const { can } = useCapabilities()
	return can(capability) ? <>{children}</> : <>{fallback}</>
}
