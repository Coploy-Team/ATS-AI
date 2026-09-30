import type {
	CreateInput,
	CustomFieldDefinition,
	EmailTemplate,
	OrgUnit,
	UpdateInput,
} from '@coploy/domain'

/** Estrutura organizacional e campos customizados (V2-501 / V2-502). */
export interface OrgRepository {
	listOrgUnits(companyId: string): Promise<OrgUnit[]>
	createOrgUnit(companyId: string, data: CreateInput<OrgUnit>): Promise<OrgUnit & { id: string }>
	updateOrgUnit(companyId: string, id: string, data: UpdateInput<OrgUnit>): Promise<void>

	listCustomFields(companyId: string): Promise<CustomFieldDefinition[]>
	createCustomField(
		companyId: string,
		data: CreateInput<CustomFieldDefinition>,
	): Promise<CustomFieldDefinition & { id: string }>
	updateCustomField(
		companyId: string,
		id: string,
		data: UpdateInput<CustomFieldDefinition>,
	): Promise<void>

	/** Templates de e-mail da empresa (V2-503) — settings, mesmo repositório. */
	listEmailTemplates(companyId: string): Promise<EmailTemplate[]>
	upsertEmailTemplate(
		companyId: string,
		kind: string,
		data: CreateInput<EmailTemplate>,
	): Promise<EmailTemplate & { id: string }>
	/**
	 * Apaga o texto do cliente para voltar à cópia padrão.
	 *
	 * Não é `active: false`: o resolvedor procura o registro e, achando um
	 * inativo, teria de saber ignorá-lo — mais um estado para dar errado. Sem
	 * registro, o caminho de envio é literalmente o mesmo de quem nunca
	 * personalizou.
	 */
	deleteEmailTemplate(companyId: string, kind: string): Promise<void>
}
