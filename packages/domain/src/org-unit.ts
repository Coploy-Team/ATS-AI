/**
 * Estrutura organizacional (V2-501).
 *
 * Vaga não pertence só à empresa: pertence a uma área, a um centro de custo, a
 * uma unidade. Sem isso não há relatório por área, orçamento por CC, nem
 * permissão por unidade — e o diretor não consegue ver "as vagas do meu time".
 *
 * ⚠️ UM tipo para os quatro conceitos, com `kind`, em vez de quatro tabelas.
 * A Gupy tem `areas`, `departments`, `cost-centers` e `operation-units`
 * separados e isso multiplica CRUD, tela e migration por quatro para um dado
 * que se comporta igual: nome, código externo, pai opcional, ativo.
 */

export const ORG_UNIT_KINDS = ['area', 'department', 'cost_center', 'unit'] as const
export type OrgUnitKind = (typeof ORG_UNIT_KINDS)[number]

export interface OrgUnit {
	id: string
	companyId: string
	kind: OrgUnitKind
	name: string
	/** Código no ERP do cliente — é por ele que o import CSV casa. */
	externalCode?: string | null
	/** Hierarquia dentro do mesmo `kind`. */
	parentId?: string | null
	active: boolean
	createdAt: Date | string
	updatedAt?: Date | string | null
}

/** Caminho legível ("Tecnologia › Engenharia") a partir da lista completa. */
export function orgUnitPath(unit: OrgUnit, all: OrgUnit[]): string {
	const parts = [unit.name]
	let current = unit
	const seen = new Set([unit.id])
	while (current.parentId) {
		const parent = all.find((item) => item.id === current.parentId)
		// ciclo em dado importado não pode virar loop infinito
		if (!parent || seen.has(parent.id)) break
		parts.unshift(parent.name)
		seen.add(parent.id)
		current = parent
	}
	return parts.join(' › ')
}
