import type { InfraProvider } from '@coploy/infra'
import type { PostJob, ScreeningKnockoutNode, ScreeningKnockoutTree } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

/** Knockout longo vira o funil de 8 etapas que a pesquisa condena. */
const MAX_NODES = 10

/**
 * Configuração do screening knockout da vaga.
 *
 * A versão é do SERVIDOR, nunca do cliente: candidaturas já avaliadas guardam
 * `screeningKnockoutTreeSnapshot` com a árvore que responderam, e o número
 * precisa avançar de forma monotônica pra auditoria fazer sentido. Cliente
 * mandando versão abriria caminho pra duas árvores diferentes com o mesmo
 * número.
 */
export function createKnockoutConfigService(infra: InfraProvider) {
	/**
	 * Regra e tipo têm que combinar, senão o `evaluateScreeningKnockout` roda
	 * comparação sem sentido e reprova candidato por dado malformado.
	 */
	function validateNode(node: ScreeningKnockoutNode, index: number) {
		const where = `nodes[${index}]`

		if (node.type === 'single-choice') {
			const options = node.options ?? []
			if (options.length < 2) {
				throw new BadRequestError(`${where}: single-choice requires at least 2 options`)
			}
			const values = Array.isArray(node.rule.value) ? node.rule.value : [node.rule.value]
			const unknown = values.filter(
				(value) => typeof value === 'string' && !options.includes(value),
			)
			if (unknown.length > 0) {
				throw new BadRequestError(
					`${where}: rule references options that do not exist (${unknown.join(', ')})`,
				)
			}
		}

		const numericOperators = [
			'greater_than',
			'greater_than_or_equal',
			'less_than',
			'less_than_or_equal',
		]
		if (numericOperators.includes(node.rule.operator)) {
			if (node.type !== 'number') {
				throw new BadRequestError(`${where}: numeric operator requires a number question`)
			}
			if (typeof node.rule.value !== 'number') {
				throw new BadRequestError(`${where}: numeric operator requires a numeric value`)
			}
		}

		if (['in', 'not_in'].includes(node.rule.operator) && !Array.isArray(node.rule.value)) {
			throw new BadRequestError(`${where}: "${node.rule.operator}" requires a list value`)
		}

		if (node.type === 'boolean' && typeof node.rule.value !== 'boolean') {
			throw new BadRequestError(`${where}: boolean question requires a boolean value`)
		}
	}

	return {
		async getKnockout(companyId: string, jobId: string) {
			const job = (await infra.jobRepository.getJob(companyId, jobId)) as PostJob | null
			if (!job) throw new NotFoundError('Job not found')

			const tree = job.knockoutTree ?? null
			return {
				knockoutTree: tree,
				// árvore vazia conta como não configurada: é o estado que o §7
				// distingue de "configurou e não tem pergunta"
				configured: Boolean(tree && tree.nodes.length > 0),
			}
		},

		async saveKnockout(params: {
			companyId: string
			jobId: string
			nodes: ScreeningKnockoutNode[]
		}): Promise<{ knockoutTree: ScreeningKnockoutTree }> {
			const { companyId, jobId, nodes } = params

			if (nodes.length > MAX_NODES) {
				throw new BadRequestError(`knockout supports at most ${MAX_NODES} questions`)
			}

			const ids = new Set<string>()
			nodes.forEach((node, index) => {
				if (ids.has(node.id)) throw new BadRequestError(`nodes[${index}]: duplicated id`)
				ids.add(node.id)
				validateNode(node, index)
			})

			const job = (await infra.jobRepository.getJob(companyId, jobId)) as PostJob | null
			if (!job) throw new NotFoundError('Job not found')

			const knockoutTree: ScreeningKnockoutTree = {
				version: (job.knockoutTree?.version ?? 0) + 1,
				nodes,
			}

			await infra.jobRepository.updateJob(companyId, jobId, { knockoutTree })
			return { knockoutTree }
		},
	}
}
