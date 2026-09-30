/**
 * Árvore de unidades organizacionais — helpers de exibição.
 *
 * Reimplementa o `orgUnitPath` do domain aqui porque web/* não importa
 * @coploy/domain (gotcha do build dual cjs+esm). A regra é a mesma: caminho
 * legível subindo pelos pais, com guarda de ciclo pra dado importado.
 */

export interface OrgUnitNode {
	id: string
	name: string
	kind?: string
	externalCode?: string | null
	parentId?: string | null
}

export function orgUnitPath(unit: OrgUnitNode, all: OrgUnitNode[]): string {
	const parts = [unit.name]
	let current = unit
	const seen = new Set([unit.id])
	while (current.parentId) {
		const parent = all.find((item) => item.id === current.parentId)
		if (!parent || seen.has(parent.id)) break
		parts.unshift(parent.name)
		seen.add(parent.id)
		current = parent
	}
	return parts.join(' \u203a ')
}

/** Ordena pai-antes-do-filho (DFS) e devolve a profundidade pra indentação. */
export function orgUnitTree<T extends OrgUnitNode>(units: T[]): Array<{ unit: T; depth: number }> {
	const byParent = new Map<string | null, T[]>()
	const ids = new Set(units.map((unit) => unit.id))
	for (const unit of units) {
		// pai desativado/de outro tipo: trata como raiz em vez de sumir da tela
		const key = unit.parentId && ids.has(unit.parentId) ? unit.parentId : null
		const list = byParent.get(key) ?? []
		list.push(unit)
		byParent.set(key, list)
	}
	const out: Array<{ unit: T; depth: number }> = []
	const walk = (parentId: string | null, depth: number) => {
		for (const unit of byParent.get(parentId) ?? []) {
			out.push({ unit, depth })
			walk(unit.id, depth + 1)
		}
	}
	walk(null, 0)
	return out
}
