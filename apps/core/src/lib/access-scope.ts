import type { FastifyRequest } from 'fastify'

import type { InfraProvider } from '@coploy/infra'
import { NotFoundError } from '@coploy/shared/errors'

import { jobScopeOfRequest } from '@/http/plugins/rbac'

/**
 * De que vaga é esta entrevista.
 *
 * O espelho identifica a vaga de DUAS formas — `post_job_id` e `job_ref` — e o
 * código já convivia com isso (ver `jobIdOf` no admin). Filtrar só pelo
 * primeiro derrubava toda entrevista gravada com a referência: o candidato
 * sumia da tela de quem criou a vaga, que foi exatamente o defeito relatado.
 */
export function jobIdOfInterview(interview: {
	post_job_id?: string | null
	job_ref?: unknown
}): string | null {
	if (interview.post_job_id) return interview.post_job_id
	const ref = interview.job_ref as { id?: string; path?: string } | null | undefined
	if (!ref) return null
	if (typeof ref === 'string') return (ref as string).split('/').pop() ?? null
	if (ref.id) return ref.id
	if (ref.path) return ref.path.split('/').pop() ?? null
	return null
}

/** A entrevista pertence a uma das vagas alcançadas? `null` = alcança todas. */
export function interviewInScope(
	interview: { post_job_id?: string | null; job_ref?: unknown },
	jobIdsInScope: Set<string> | null | undefined,
): boolean {
	if (!jobIdsInScope) return true
	const jobId = jobIdOfInterview(interview)
	return jobId !== null && jobIdsInScope.has(jobId)
}

/**
 * Alcance por vaga — a segunda metade da autorização.
 *
 * A primeira metade (capability) responde "esta pessoa pode ler vaga?". Esta
 * responde "quais". O recrutador trabalha nas vagas que criou; administrador e
 * dono enxergam a empresa inteira.
 *
 * ## Por que 404 e não 403
 *
 * Uma vaga sigilosa que responde "403 — você não tem acesso" confirma que ela
 * existe, e para quem a marcou como sigilosa isso já é vazamento: dá para
 * varrer identificadores e mapear o que a empresa está contratando em silêncio.
 * Fora do alcance, a vaga simplesmente não existe.
 */
/**
 * Versão sem leitura, para quem JÁ carregou a vaga.
 *
 * A maioria das rotas por vaga lê o documento e devolve 404 quando não acha —
 * então o alcance se decide com o dado em mãos, sem uma segunda ida ao banco.
 */
export function isJobInScope(
	request: FastifyRequest,
	job: { creatorId?: string | null } | null | undefined,
): boolean {
	const { scope, userId } = jobScopeOfRequest(request)
	if (scope === 'all') return true
	if (!job || !userId) return false
	return job.creatorId === userId
}

export async function assertJobInScope(
	infra: InfraProvider,
	request: FastifyRequest,
	companyId: string,
	jobId: string,
): Promise<void> {
	const { scope, userId } = jobScopeOfRequest(request)
	if (scope === 'all') return

	const job = (await infra.jobRepository
		.getJob(companyId, jobId)
		.catch(() => null)) as { creatorId?: string | null } | null

	/*
	 * Vaga inexistente e vaga fora do alcance dão a MESMA resposta, de
	 * propósito: distinguir as duas devolve a varredura que o 404 evitou.
	 */
	if (!job || !userId || job.creatorId !== userId) {
		throw new NotFoundError('Vaga não encontrada')
	}
}

/**
 * Os identificadores das vagas que esta sessão alcança — ou `null` para
 * "todas", que é o caso da maioria e não deve custar uma leitura.
 *
 * Serve às listagens que não são POR vaga (entrevistas da empresa, painéis):
 * elas filtram o resultado por este conjunto.
 */
/**
 * Alcance pronto para os painéis, numa chamada só.
 *
 * O painel lê duas listas (vagas e entrevistas) e cada uma se recorta de um
 * jeito: a de vagas por criador, a de entrevistas pelo conjunto de vagas
 * alcançadas. Resolver as duas juntas evita que uma rota filtre uma e esqueça
 * a outra — que é como um número agregado continua contando o que a tela
 * escondeu.
 */
export async function dashboardScope(
	infra: InfraProvider,
	request: FastifyRequest,
	companyId: string,
): Promise<{ jobIds: Set<string> | null; userId: string | null }> {
	const { scope, userId } = jobScopeOfRequest(request)
	if (scope === 'all') return { jobIds: null, userId: null }
	return { jobIds: await jobIdsInScope(infra, request, companyId), userId }
}

export async function jobIdsInScope(
	infra: InfraProvider,
	request: FastifyRequest,
	companyId: string,
): Promise<Set<string> | null> {
	const { scope, userId } = jobScopeOfRequest(request)
	if (scope === 'all') return null
	if (!userId) return new Set()

	const jobs = (await infra.jobRepository
		.listJobs(companyId, { filters: [{ field: 'creatorId', operator: '==', value: userId }] })
		.catch(() => [])) as Array<{ id?: string | null }>

	return new Set(jobs.map((job) => job.id).filter((id): id is string => Boolean(id)))
}
