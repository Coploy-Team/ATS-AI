import type { CreateInput, ListOptions, Nps } from '@coploy/domain'

/**
 * Pesquisa de satisfação do candidato.
 *
 * Separado do repositório de cobrança em 2026-08-29: NPS estava lá por acaso de
 * arquivo, e o acaso obrigava quem só queria a pesquisa a carregar junto o
 * modelo comercial.
 */
export interface NpsRepository {
	listNps(companyId: string, options?: ListOptions): Promise<Nps[]>
	createNps(companyId: string, data: CreateInput<Nps>): Promise<Nps & { id: string }>
}
