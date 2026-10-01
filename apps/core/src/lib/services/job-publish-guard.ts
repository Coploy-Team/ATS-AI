import type { PostJob } from '@coploy/domain'
import { jobRunsAiInterview, resolveJobStatus } from '@coploy/domain'

/**
 * O que impede uma vaga de ir ao ar.
 *
 * A validação saiu da CRIAÇÃO e veio para a PUBLICAÇÃO. Enquanto ela morava na
 * criação, o formulário tinha que exigir tudo de uma vez — seis passos antes de
 * existir qualquer coisa — e mesmo assim vaga incompleta chegava ao candidato
 * pelos caminhos que não passam pelo formulário (importação, API, legado).
 *
 * A régua nova é a oposta: rascunho aceita quase nada, publicar exige o que o
 * candidato precisa ler e o que a entrevista precisa para acontecer.
 */

export type PublishBlocker = {
	/** O campo que falta — a tela usa para levar a pessoa até ele. */
	field: string
	/** Por que aquilo impede, na língua de quem lê. */
	reason: string
}

/**
 * Só faz sentido exigir pergunta de quem vai de fato entrevistar.
 *
 * Vaga de triagem (`evaluation`) não conduz entrevista, então cobrar pergunta
 * dela seria inventar um requisito que o produto não tem.
 */
const TIPOS_QUE_ENTREVISTAM = new Set(['interview', 'emotional', 'exitJob', 'whatsapp'])

export type ContextoDePublicacao = {
	/**
	 * Esta instalação tem o Motor?
	 *
	 * ⚠️ Sem ele NÃO se cobra pergunta — e isso não é frouxidão, é a correção de
	 * um defeito: a instalação aberta não tem passo de perguntas no formulário,
	 * então a vaga era recusada por algo que a pessoa não tinha como resolver.
	 */
	motorDisponivel: boolean
}

function vazio(valor: unknown): boolean {
	return typeof valor !== 'string' || valor.trim() === ''
}

/**
 * Lista tudo que falta — não para no primeiro.
 *
 * Devolver um erro por vez faria a pessoa descobrir os problemas em fila,
 * salvando e apanhando a cada rodada.
 */
export function findPublishBlockers(
	job: Partial<PostJob>,
	contexto: ContextoDePublicacao = { motorDisponivel: true },
): PublishBlocker[] {
	const blockers: PublishBlocker[] = []

	if (vazio(job.jobName)) {
		blockers.push({ field: 'jobName', reason: 'A vaga precisa de um cargo.' })
	}

	if (vazio(job.jobDescription) && vazio(job.generatedJobDescription)) {
		blockers.push({
			field: 'jobDescription',
			reason: 'Sem descrição, a página da vaga abre vazia para o candidato.',
		})
	}

	if (vazio(job.jobCategories)) {
		blockers.push({
			field: 'jobCategories',
			reason: 'A área é o que faz a vaga ser encontrada na busca e nos filtros.',
		})
	}

	if (vazio(job.carrerLevel)) {
		blockers.push({
			field: 'carrerLevel',
			reason: 'O nível é o que diz ao candidato se a vaga é para ele.',
		})
	}

	/*
	 * O defeito que originou esta leva: vaga sem pergunta era publicada, o
	 * candidato entrava na sala e não havia entrevista para conduzir. Havia
	 * parede no orchestrator e no convite — nenhuma antes de publicar, que é
	 * onde a pessoa ainda pode consertar.
	 */
	const entrevista =
		jobRunsAiInterview(job, { motorDisponivel: contexto.motorDisponivel }) &&
		TIPOS_QUE_ENTREVISTAM.has(job.typeInterview ?? '')
	if (entrevista) {
		const perguntas =
			(job.jobQuestions?.length ?? 0) + (job.additionalQuestions?.length ?? 0)
		if (perguntas === 0) {
			blockers.push({
				field: 'jobQuestions',
				reason:
					'Sem pergunta, o candidato entra na entrevista e não há o que perguntar.',
			})
		}
	}

	return blockers
}

/**
 * A vaga está saindo do rascunho agora?
 *
 * ⚠️ A guarda vale só na TRANSIÇÃO. Vaga que já está no ar — e a base legada
 * inteira está — continua editável mesmo incompleta: ela já foi publicada, e
 * travar a edição puniria justamente quem tenta melhorá-la.
 */
export function isLeavingDraft(
	job: Pick<PostJob, 'status' | 'stopped' | 'archived'>,
	patch: { status?: unknown; public?: unknown; stopped?: unknown },
): boolean {
	if (resolveJobStatus(job) !== 'draft') return false
	return (
		patch.status === 'open' || patch.public === true || patch.stopped === false
	)
}
