import { esquecerPapel } from '@/lib/guest'
import { queryClient } from '@/lib/query-client'

/**
 * Apaga TUDO que pertence à sessão anterior.
 *
 * O cache do TanStack Query sobrevivia ao logout: sair e entrar com outra
 * conta mostrava o nome, a empresa e — o que passou a importar de verdade — as
 * PERMISSÕES da pessoa anterior, até alguém dar refresh. Com papéis no
 * produto, isso deixa de ser cosmético: um recrutador entrando depois de um
 * administrador via, por alguns instantes, as telas do administrador.
 *
 * Também vai embora o que guardamos em `localStorage` para decidir antes da
 * primeira resposta (papel e edição). Manter isso entre contas é a mesma
 * doença, só que persistida.
 */
const CHAVES_DE_SESSAO = ['coploy.ats.features']

export function limparSessao() {
	esquecerPapel()
	for (const chave of CHAVES_DE_SESSAO) {
		try {
			localStorage.removeItem(chave)
		} catch {
			/* localStorage indisponível — nada a limpar */
		}
	}
	/*
	 * `clear()` e não `invalidateQueries()`: invalidar mantém o dado antigo na
	 * tela enquanto revalida, que é exatamente o instante que queremos evitar.
	 */
	queryClient.clear()
}
