import { QueryClient } from '@tanstack/react-query'

/**
 * O cliente de queries em módulo, e não dentro do `main.tsx`.
 *
 * Assim o cache pode ser limpo de QUALQUER saída de sessão — inclusive das que
 * não são componentes, como a guarda de rota que desloga quem perdeu acesso.
 * Enquanto ele vivia só no `main`, a limpeza dependia de estar num componente
 * com o hook, e as outras saídas ficavam de fora.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
	},
})
