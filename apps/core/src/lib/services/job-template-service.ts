import type { InfraProvider } from '@coploy/infra'
import type { JobTemplate } from '@coploy/domain'
import { jobTemplateContentFrom } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'

/**
 * Modelos de vaga.
 *
 * Duas portas de entrada, e a segunda é a que faz o acervo existir: "salvar
 * como modelo" a partir de uma vaga que já foi escrita. Um cadastro em branco
 * exigiria que alguém sentasse para escrever modelos antes de ter precisado
 * deles — e é por isso que catálogo de modelo costuma nascer vazio e morrer
 * vazio.
 */
export function createJobTemplateService(infra: InfraProvider) {
	return {
		async listTemplates(companyId: string): Promise<JobTemplate[]> {
			const templates = await infra.jobTemplateRepository.listJobTemplates(companyId)
			return templates.filter((t) => t.active !== false)
		},

		async getTemplate(companyId: string, id: string): Promise<JobTemplate> {
			const template = await infra.jobTemplateRepository.getJobTemplate(companyId, id)
			if (!template || template.active === false) {
				throw new BadRequestError('Modelo não encontrado')
			}
			return template
		},

		async createTemplate(
			companyId: string,
			userId: string,
			data: Record<string, unknown>,
		): Promise<{ id: string }> {
			const nome = typeof data.name === 'string' ? data.name.trim() : ''
			if (!nome) {
				throw new BadRequestError('O modelo precisa de um nome')
			}

			let criadoPor: string | null = null
			try {
				const user = await infra.userRepository.getUsersCompany(userId)
				criadoPor =
					user?.display_name || (user?.email as string)?.split('@')[0] || null
			} catch {
				/* nome do autor é enfeite: falhar aqui não pode impedir salvar o modelo */
			}

			const created = await infra.jobTemplateRepository.createJobTemplate(companyId, {
				...jobTemplateContentFrom(data),
				name: nome,
				jobName: typeof data.jobName === 'string' ? data.jobName.trim() : null,
				description:
					typeof data.description === 'string' ? data.description.trim() : null,
				active: true,
				createdByUserId: userId,
				createdByName: criadoPor,
			} as never)
			return { id: created.id }
		},

		/**
		 * Cria um modelo a partir de uma vaga que já existe.
		 *
		 * É por aqui que o acervo nasce: a pessoa escreveu a vaga uma vez e a
		 * transforma em ponto de partida sem redigitar nada.
		 */
		/**
		 * Registra que este modelo virou vaga.
		 *
		 * ⚠️ NUNCA derruba a criação da vaga. A data serve para ordenar uma
		 * sugestão; falhar em gravá-la não pode custar a vaga que a pessoa acabou
		 * de escrever. Por isso quem chama engole o erro.
		 */
		async markUsed(companyId: string, id: string): Promise<void> {
			await infra.jobTemplateRepository.updateJobTemplate(companyId, id, {
				lastUsedAt: new Date(),
			})
		},

		async createFromJob(
			companyId: string,
			userId: string,
			jobId: string,
			name: string,
		): Promise<{ id: string }> {
			const job = await infra.jobRepository.getJob(companyId, jobId)
			if (!job) {
				throw new BadRequestError('Vaga não encontrada')
			}
			return this.createTemplate(companyId, userId, {
				...jobTemplateContentFrom(job as unknown as Record<string, unknown>),
				name,
				jobName: job.jobName ?? null,
			})
		},

		async updateTemplate(
			companyId: string,
			id: string,
			data: Record<string, unknown>,
		): Promise<void> {
			await this.getTemplate(companyId, id)
			const patch: Record<string, unknown> = { ...jobTemplateContentFrom(data) }
			if (typeof data.name === 'string') {
				const nome = data.name.trim()
				if (!nome) throw new BadRequestError('O modelo precisa de um nome')
				patch.name = nome
			}
			if (typeof data.jobName === 'string') patch.jobName = data.jobName.trim()
			if (typeof data.description === 'string') {
				patch.description = data.description.trim()
			}
			await infra.jobTemplateRepository.updateJobTemplate(companyId, id, patch as never)
		},

		/**
		 * Remover é desativar.
		 *
		 * Vaga criada a partir de um modelo não guarda vínculo com ele, então
		 * apagar de verdade não quebraria nada — mas desativar deixa o histórico
		 * de quem escreveu o quê, e é reversível se alguém apagar por engano.
		 */
		async deactivateTemplate(companyId: string, id: string): Promise<void> {
			await this.getTemplate(companyId, id)
			await infra.jobTemplateRepository.updateJobTemplate(companyId, id, {
				active: false,
			} as never)
		},
	}
}
