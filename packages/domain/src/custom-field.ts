/**
 * Campos customizados (V2-502).
 *
 * Toda empresa tem um campo próprio: matrícula, turno, unidade, número da
 * requisição no SAP. Sem isso, ou a empresa não migra, ou faz gambiarra no campo
 * de descrição — e o dado fica ilegível para relatório.
 */

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const CUSTOM_FIELD_ENTITIES = ['job', 'candidate'] as const
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number]

export interface CustomFieldDefinition {
	id: string
	companyId: string
	entity: CustomFieldEntity
	/** Chave estável usada no armazenamento — não muda ao renomear o rótulo. */
	key: string
	label: string
	type: CustomFieldType
	/** Opções de `select`. */
	options?: string[] | null
	required: boolean
	/** Ordem de exibição no formulário. */
	order: number
	active: boolean
	createdAt: Date | string
}

export type CustomFieldValues = Record<string, string | number | boolean | null>

/**
 * Valida valores contra as definições.
 *
 * Devolve a lista de erros em vez de lançar no primeiro: um formulário com três
 * campos errados precisa mostrar os três, não obrigar a descobrir um por vez.
 */
export function validateCustomFields(
	definitions: CustomFieldDefinition[],
	values: CustomFieldValues,
): string[] {
	const errors: string[] = []

	for (const definition of definitions) {
		if (!definition.active) continue
		const value = values[definition.key]
		const empty = value === null || value === undefined || value === ''

		if (definition.required && empty) {
			errors.push(`${definition.label}: obrigatório`)
			continue
		}
		if (empty) continue

		if (definition.type === 'number' && typeof value !== 'number') {
			errors.push(`${definition.label}: deve ser número`)
		}
		if (definition.type === 'boolean' && typeof value !== 'boolean') {
			errors.push(`${definition.label}: deve ser verdadeiro ou falso`)
		}
		if (definition.type === 'date' && Number.isNaN(new Date(String(value)).getTime())) {
			errors.push(`${definition.label}: data inválida`)
		}
		if (
			definition.type === 'select' &&
			definition.options &&
			!definition.options.includes(String(value))
		) {
			errors.push(`${definition.label}: opção inválida`)
		}
	}

	return errors
}
