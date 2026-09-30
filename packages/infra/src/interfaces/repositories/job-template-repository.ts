import type { CreateInput, JobTemplate, UpdateInput } from '@coploy/domain'

/**
 * Modelos de vaga da empresa.
 *
 * Repositório próprio, e não mais um método no `OrgRepository`: aquele já
 * carrega estrutura organizacional, campos customizados e templates de e-mail
 * por acaso de arquivo. Empilhar um quarto assunto repetiria o acoplamento que
 * o NPS acabou de pagar para desfazer.
 */
export interface JobTemplateRepository {
	listJobTemplates(companyId: string): Promise<JobTemplate[]>
	getJobTemplate(companyId: string, id: string): Promise<JobTemplate | null>
	createJobTemplate(
		companyId: string,
		data: CreateInput<JobTemplate>,
	): Promise<JobTemplate & { id: string }>
	updateJobTemplate(
		companyId: string,
		id: string,
		data: UpdateInput<JobTemplate>,
	): Promise<void>
}
