import type {
	CustomFieldDefinition,
	CustomFieldValues,
	EmailTemplate,
	OrgUnit,
} from '@coploy/domain'
import {
	EMAIL_TEMPLATE_KINDS,
	ORG_UNIT_KINDS,
	orgUnitPath,
	validateCustomFields,
	validateTemplate,
} from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

/** Chave estável a partir do rótulo: "Nº da requisição" → `n_da_requisicao`. */
function toKey(label: string): string {
	return label
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
		.slice(0, 40)
}

/**
 * Estrutura organizacional e campos customizados (V2-501 / V2-502).
 */
/** Timestamp do Firestore, Date do Postgres ou string — sempre sai ISO. */
function toIso(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (value instanceof Date) return value.toISOString()
	const stamp = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
	if (typeof stamp.toDate === 'function') return stamp.toDate().toISOString()
	const seconds = stamp._seconds ?? stamp.seconds
	return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

export function createOrgService(infra: InfraProvider) {
	return {
		/**
		 * Unidade desativada sai da lista por padrão.
		 *
		 * Antes vinha tudo, então `deactivateOrgUnit` gravava `active: false` e a
		 * unidade continuava aparecendo — desativar não desativava nada aos olhos
		 * de quem usa. O caminho da HIERARQUIA usa a lista completa de propósito:
		 * unidade ativa pendurada numa desativada precisa continuar sabendo de
		 * quem descende, senão o rótulo perde o meio do caminho.
		 */
		async listOrgUnits(companyId: string, options: { includeInactive?: boolean } = {}) {
			const units = await infra.orgRepository.listOrgUnits(companyId)
			const visible = options.includeInactive
				? units
				: units.filter((unit) => (unit as { active?: boolean }).active !== false)
			return {
				units: visible.map((unit) => ({ ...unit, path: orgUnitPath(unit, units) })),
			}
		},

		async createOrgUnit(params: {
			companyId: string
			kind: string
			name: string
			externalCode?: string | null
			parentId?: string | null
		}): Promise<OrgUnit> {
			const name = params.name.trim()
			if (!name) throw new BadRequestError('Informe o nome')
			if (!(ORG_UNIT_KINDS as readonly string[]).includes(params.kind)) {
				throw new BadRequestError('Tipo de unidade inválido')
			}

			const existing = await infra.orgRepository.listOrgUnits(params.companyId)
			const duplicate = existing.some(
				(unit) => unit.kind === params.kind && unit.name.toLowerCase() === name.toLowerCase(),
			)
			if (duplicate) throw new BadRequestError('Já existe uma unidade com este nome')

			/*
			 * Hierarquia LIVRE entre tipos (decisão de 2026-08-22, no teste da
			 * open): a empresa real se organiza "unidade São Paulo → área
			 * Tecnologia → time TI" — a regra antiga de pai-do-mesmo-tipo
			 * obrigava quatro árvores paralelas que ninguém pensa assim. O tipo
			 * vira metadado do nó, não fronteira da árvore.
			 */
			if (params.parentId) {
				const parent = existing.find((unit) => unit.id === params.parentId)
				if (!parent) throw new BadRequestError('Unidade pai não encontrada')
			}

			return infra.orgRepository.createOrgUnit(params.companyId, {
				companyId: params.companyId,
				kind: params.kind,
				name,
				externalCode: params.externalCode ?? null,
				parentId: params.parentId ?? null,
				active: true,
			} as never)
		},

		/**
		 * Desativa em vez de apagar.
		 *
		 * Unidade usada por vaga antiga não pode sumir do histórico: relatório de
		 * seis meses atrás precisa continuar dizendo de que área era a vaga.
		 */
		async setOrgUnitActive(params: { companyId: string; id: string; active: boolean }) {
			const units = await infra.orgRepository.listOrgUnits(params.companyId)
			if (!units.some((unit) => (unit as { id?: string }).id === params.id)) {
				throw new BadRequestError('Unidade não encontrada')
			}

			await infra.orgRepository.updateOrgUnit(params.companyId, params.id, {
				active: params.active,
			} as never)
		},

		async setCustomFieldActive(params: { companyId: string; id: string; active: boolean }) {
			const fields = await infra.orgRepository.listCustomFields(params.companyId)
			if (!fields.some((field) => (field as { id?: string }).id === params.id)) {
				throw new BadRequestError('Campo não encontrado')
			}
			await infra.orgRepository.updateCustomField(params.companyId, params.id, {
				active: params.active,
			} as never)
		},

		async listCustomFields(params: {
			companyId: string
			entity?: string
			includeInactive?: boolean
		}) {
			const all = await infra.orgRepository.listCustomFields(params.companyId)
			const fields = params.includeInactive
				? all
				: all.filter((field) => (field as { active?: boolean }).active !== false)
			return {
				fields: params.entity ? fields.filter((field) => field.entity === params.entity) : fields,
			}
		},

		async createCustomField(params: {
			companyId: string
			entity: string
			label: string
			type: string
			options?: string[] | null
			required?: boolean
		}): Promise<CustomFieldDefinition> {
			const label = params.label.trim()
			if (!label) throw new BadRequestError('Informe o rótulo do campo')
			if (params.type === 'select' && (!params.options || params.options.length === 0)) {
				throw new BadRequestError('Campo de seleção precisa de opções')
			}

			const key = toKey(label)
			if (!key) throw new BadRequestError('Rótulo inválido')

			const existing = await infra.orgRepository.listCustomFields(params.companyId)
			if (existing.some((field) => field.entity === params.entity && field.key === key)) {
				throw new BadRequestError('Já existe um campo com este nome')
			}

			return infra.orgRepository.createCustomField(params.companyId, {
				companyId: params.companyId,
				entity: params.entity,
				key,
				label,
				type: params.type,
				options: params.options ?? null,
				required: params.required ?? false,
				order: existing.length,
				active: true,
			} as never)
		},

		/**
		 * Valida valores antes de gravar na entidade dona.
		 *
		 * Devolve TODOS os erros de uma vez: formulário com três campos errados
		 * precisa mostrar os três, não obrigar a descobrir um por vez.
		 */
		async validateValues(params: {
			companyId: string
			entity: string
			values: CustomFieldValues
		}) {
			const fields = await infra.orgRepository.listCustomFields(params.companyId)
			const errors = validateCustomFields(
				fields.filter((field) => field.entity === params.entity),
				params.values,
			)
			if (errors.length > 0) throw new BadRequestError(errors.join(' · '))
			return { ok: true as const }
		},

		/**
		 * A unidade pertence a esta empresa?
		 *
		 * Sem esta checagem, o `orgUnitId` do corpo do request seria gravado como
		 * veio — e um id de outro tenant colocaria a vaga sob a área de um cliente
		 * diferente. Vínculo entre entidades sempre confere o dono.
		 */
		async assertOrgUnit(companyId: string, orgUnitId: string) {
			const units = await infra.orgRepository.listOrgUnits(companyId)
			if (!units.some((unit) => unit.id === orgUnitId)) {
				throw new BadRequestError('Unidade organizacional não encontrada nesta empresa')
			}
		},

		async listEmailTemplates(companyId: string) {
			const templates = await infra.orgRepository.listEmailTemplates(companyId)
			/*
			 * Datas normalizadas para ISO antes de responder.
			 *
			 * O Firestore devolve `Timestamp` (`{_seconds, _nanoseconds}`), que não
			 * é string nem Date — e o schema da resposta recusava, então a rota
			 * respondia **400 assim que existisse um template**. Ninguém tinha
			 * notado porque, sem tela, nunca houve um. É a mesma regra que o
			 * selfhosted já exigia (Date do Postgres → ISO).
			 */
			return {
				templates: (templates as unknown as Array<Record<string, unknown>>).map(
					(template) =>
						({
							...template,
							createdAt: toIso(template.createdAt),
							updatedAt: toIso(template.updatedAt),
						}) as unknown as EmailTemplate,
				),
				kinds: [...EMAIL_TEMPLATE_KINDS],
			}
		},

		/**
		 * Salva template do cliente (V2-503).
		 *
		 * Validação recusa ANTES de salvar: template com variável inexistente
		 * chegaria ao candidato com `{{salario}}` cru no corpo do e-mail. É mais
		 * barato barrar aqui do que explicar depois.
		 */
		async saveEmailTemplate(params: {
			companyId: string
			kind: string
			subject: string
			body: string
			updatedByUserId?: string | null
		}): Promise<EmailTemplate> {
			if (!(EMAIL_TEMPLATE_KINDS as readonly string[]).includes(params.kind)) {
				throw new BadRequestError('Tipo de template inválido')
			}
			const errors = validateTemplate(params.subject, params.body)
			if (errors.length > 0) throw new BadRequestError(errors.join(' · '))

			return infra.orgRepository.upsertEmailTemplate(params.companyId, params.kind, {
				companyId: params.companyId,
				kind: params.kind,
				subject: params.subject.trim(),
				body: params.body.trim(),
				active: true,
				updatedByUserId: params.updatedByUserId ?? null,
			} as never)
		},

		/**
		 * Volta ao texto padrão da ferramenta (V2-503).
		 *
		 * Sem isto, personalizar era via de mão única: quem apagou o texto para
		 * escrever o seu e não gostou do resultado não tinha como desfazer — o
		 * campo não aceita vazio, e salvar qualquer coisa mantém o override. O
		 * caminho de envio já cai na cópia padrão quando não há registro, então
		 * apagar É a restauração.
		 */
		async resetEmailTemplate(params: { companyId: string; kind: string }) {
			if (!(EMAIL_TEMPLATE_KINDS as readonly string[]).includes(params.kind)) {
				throw new BadRequestError('Tipo de template inválido')
			}
			await infra.orgRepository.deleteEmailTemplate(params.companyId, params.kind)
		},
	}
}
