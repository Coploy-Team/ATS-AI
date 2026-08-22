import type { InfraProvider } from '@coploy/infra'
import type { SharedCandidateLinkSections } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { createJobsService } from '@/lib/services/jobs-service'

const CODE_LENGTH = 16

export function createSharedCandidateLinkService(infra: InfraProvider) {
	const jobsService = createJobsService(infra)

	return {
		async createShareLink(
			companyId: string,
			jobId: string,
			data: { candidateIds: string[]; sections: SharedCandidateLinkSections },
			createdBy?: string | null,
		) {
			const job = await jobsService.getJob(companyId, jobId)
			if (!job) {
				throw new BadRequestError('Job not found')
			}

			const { nanoid } = await import('nanoid')
			const code = nanoid(CODE_LENGTH)

			const sections: SharedCandidateLinkSections = {
				...data.sections,
				// perguntas + vídeo são a base obrigatória do link — nunca ocultáveis.
				questions: true,
			}

			await infra.sharedCandidateLinkRepository.create({
				code,
				companyId,
				jobId,
				candidateIds: data.candidateIds,
				sections,
				createdBy: createdBy ?? null,
				createdAt: new Date(),
				expiresAt: null,
				revoked: false,
			})

			return { code }
		},

		async resolveShareLink(code: string) {
			const record = await infra.sharedCandidateLinkRepository.getByCode(code)
			if (!record || record.revoked) {
				throw new BadRequestError('Share link inválido')
			}
			if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
				throw new BadRequestError('Share link inválido')
			}
			return record
		},
	}
}

// ── Allowlists ──────────────────────────────────────────────────────
//
// Cortes de dados do share são feitos por ALLOWLIST: o objeto de saída
// é montado do zero, campo a campo, a partir de uma base considerada
// segura. Campos gated por seção (score/feedback/analysis) só entram
// se a seção estiver ligada. NUNCA usar `{...source}` no retorno.

/** Campos seguros da listagem — usados por `web/dashboard` `useSharedCandidates`. */
const LIST_CANDIDATE_BASE_FIELDS = [
	'id',
	'user_ref',
	'job_applied_ref',
	'job_ref',
	'name',
	'display_name',
	'photo_url',
	'photoUrl',
	'email',
	'phone_number',
	'date',
	'date_select',
	'candidate_status',
	'candidateStatus',
	'finished',
	'likes',
	'totalLikes',
	'totalDislikes',
] as const

/**
 * Monta o candidato da listagem do share por allowlist. `score` só entra
 * quando a seção `score` estiver liberada.
 */
export function stripListCandidate(
	candidate: Record<string, unknown>,
	sections: SharedCandidateLinkSections,
): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const field of LIST_CANDIDATE_BASE_FIELDS) {
		if (field in candidate) {
			result[field] = candidate[field]
		}
	}

	if ('score' in candidate) {
		result.score = sections.score ? candidate.score : null
	}

	return result
}

/** Campos base de cada pergunta — texto/vídeo, nunca gated. */
const INFO_ITEM_BASE_FIELDS = [
	'id',
	'question',
	'video',
	'audio',
	'answer',
	'text',
	/*
	 * A LEGENDA.
	 *
	 * Faltava nesta lista, e como o payload compartilhado é montado por allowlist
	 * explícita, ela era descartada no servidor: o gestor recebia o vídeo e o
	 * player dizia "legendas indisponíveis" mesmo numa entrevista que TEM
	 * legenda. Fica na base, junto de `answer` e `text` — é a mesma coisa que
	 * eles (o que a pessoa disse), só com marcação de tempo. Quem pode assistir
	 * e ler a resposta pode ler a legenda.
	 */
	'captionSegments',
	'finished',
	'pulou_a_pergunta',
	'transcription_status',
] as const

/** Campos por pergunta liberados quando `feedback` está ligado. */
const INFO_ITEM_FEEDBACK_FIELDS = ['feedback', 'strengths', 'improvement'] as const

/** Campos por pergunta liberados quando `analysis` está ligado. */
const INFO_ITEM_ANALYSIS_FIELDS = [
	'analyze',
	'score_detalhado',
	'metricas_decisao',
	'avaliacao_pergunta',
	'qRecomendation',
] as const

function stripInfoItem(
	item: Record<string, unknown>,
	sections: SharedCandidateLinkSections,
): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const field of INFO_ITEM_BASE_FIELDS) {
		if (field in item) {
			result[field] = item[field]
		}
	}

	if (sections.score && 'score' in item) {
		result.score = item.score
	}

	if (sections.feedback) {
		for (const field of INFO_ITEM_FEEDBACK_FIELDS) {
			if (field in item) {
				result[field] = item[field]
			}
		}
	}

	if (sections.analysis) {
		for (const field of INFO_ITEM_ANALYSIS_FIELDS) {
			if (field in item) {
				result[field] = item[field]
			}
		}
	}

	return result
}

/** Campos base da interview — nunca revelam nota/feedback/análise. */
const INTERVIEW_BASE_FIELDS = [
	'id',
	'dateTime',
	'date',
	'type_interview',
	'job_name',
	'masked',
] as const

/** Campos da interview liberados quando `score` está ligado. */
const INTERVIEW_SCORE_FIELDS = ['score', 'scom', 'sres', 'stec'] as const

/** Campos da interview liberados quando `feedback` está ligado. */
const INTERVIEW_FEEDBACK_FIELDS = [
	'generalFeedback',
	'recomentation',
	'generalStrengths',
	'generalImprovement',
] as const

/** Campos analíticos da interview liberados quando `analysis` está ligado. */
const INTERVIEW_ANALYSIS_FIELDS = [
	'cheat',
	'analise_por_resposta',
	'competenciasCriticas',
	'competenciasAdicionais',
	'profundidade',
	'estruturacao',
	'exemplificacao',
	'metricas',
	'nivel_confianca',
	'aderencia_descricao',
	'alinhamento_responsabilidades',
	'requisitos_atendidos',
	'alinhamento_nivel',
	'gap_para_proximo_nivel',
] as const

function stripInterview(
	interview: Record<string, unknown>,
	sections: SharedCandidateLinkSections,
): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const field of INTERVIEW_BASE_FIELDS) {
		if (field in interview) {
			result[field] = interview[field]
		}
	}

	if (sections.score) {
		for (const field of INTERVIEW_SCORE_FIELDS) {
			if (field in interview) {
				result[field] = interview[field]
			}
		}
	} else if ('score' in interview) {
		// mantém compat com consumidores que esperam `score: null` (vs. ausente)
		result.score = null
	}

	if (sections.feedback) {
		for (const field of INTERVIEW_FEEDBACK_FIELDS) {
			if (field in interview) {
				result[field] = interview[field]
			}
		}
	} else {
		if ('generalFeedback' in interview) result.generalFeedback = null
		if ('recomentation' in interview) result.recomentation = null
	}

	if (sections.analysis) {
		for (const field of INTERVIEW_ANALYSIS_FIELDS) {
			if (field in interview) {
				result[field] = interview[field]
			}
		}
	} else if ('cheat' in interview) {
		result.cheat = null
	}

	const info = interview.info
	if (Array.isArray(info)) {
		result.info = info.map((item) => stripInfoItem(item as Record<string, unknown>, sections))
	}

	return result
}

/** Campos de texto de `whatsappTriagemResult` gated por `feedback`. */
const WHATSAPP_TRIAGEM_FEEDBACK_FIELDS = ['feedback_geral', 'recomendacao_recrutador'] as const

/** Campos analíticos de `whatsappTriagemResult` gated por `analysis`. */
const WHATSAPP_TRIAGEM_ANALYSIS_FIELDS = [
	'porcentagem_match',
	'requisitos_atendidos',
	'requisitos_nao_atendidos',
	'pontos_atencao',
] as const

function stripWhatsappTriagemResult(
	value: unknown,
	sections: SharedCandidateLinkSections,
): unknown {
	if (!value || typeof value !== 'object') return null

	const source = value as Record<string, unknown>
	const result: Record<string, unknown> = {}

	if ('masked' in source) result.masked = source.masked
	if ('message' in source) result.message = source.message

	if (sections.feedback) {
		for (const field of WHATSAPP_TRIAGEM_FEEDBACK_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.analysis) {
		for (const field of WHATSAPP_TRIAGEM_ANALYSIS_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	return result
}

/** Campos de texto de `exitJobResult` gated por `feedback`. */
const EXIT_JOB_FEEDBACK_FIELDS = [
	'executive_summary',
	'resignation_reasons',
	'negative_aspects',
	'positive_aspects',
	'extra_insights',
	'improvement_actions',
] as const

/** Campos analíticos de `exitJobResult` gated por `analysis`. */
const EXIT_JOB_ANALYSIS_FIELDS = ['mapped_emotions', 'reasons_over_time'] as const

function stripExitJobResult(value: unknown, sections: SharedCandidateLinkSections): unknown {
	if (!value || typeof value !== 'object') return null

	const source = value as Record<string, unknown>
	const result: Record<string, unknown> = {}

	if ('masked' in source) result.masked = source.masked
	if ('message' in source) result.message = source.message

	if (sections.feedback) {
		for (const field of EXIT_JOB_FEEDBACK_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.analysis) {
		for (const field of EXIT_JOB_ANALYSIS_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	return result
}

/** Campos de nota de `avaliacaoFinal` gated por `score`. */
const AVALIACAO_FINAL_SCORE_FIELDS = ['score', 'pontuacao_final'] as const

/** Campos textuais de `avaliacaoFinal` gated por `feedback`. */
const AVALIACAO_FINAL_FEEDBACK_FIELDS = [
	'generalFeedback',
	'generalRecomendation',
	'recomendacoes',
	'resumo',
] as const

/** Campos analíticos de `avaliacaoFinal` gated por `analysis`. */
const AVALIACAO_FINAL_ANALYSIS_FIELDS = [
	'competencias_criticas',
	'competencias_adicionais',
	'atendimento_expectativas',
	'nivel',
] as const

function stripAvaliacaoFinal(
	value: unknown,
	sections: SharedCandidateLinkSections,
): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object') return undefined

	const source = value as Record<string, unknown>
	const result: Record<string, unknown> = {}

	if (sections.score) {
		for (const field of AVALIACAO_FINAL_SCORE_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.feedback) {
		for (const field of AVALIACAO_FINAL_FEEDBACK_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.analysis) {
		for (const field of AVALIACAO_FINAL_ANALYSIS_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	return Object.keys(result).length > 0 ? result : undefined
}

/** Campos top-level de `jobApplied` que nunca revelam nota/feedback/análise. */
const JOB_APPLIED_BASE_FIELDS = [
	'id',
	/*
	 * QUEM É A PESSOA.
	 *
	 * Faltava, e o destinatário abria o vídeo sem saber de quem era — a tela caía
	 * no título genérico da vaga. Identidade não é dado sensível aqui: o
	 * compartilhamento é do vídeo, e a pessoa aparece nele. Esconder o nome não
	 * protegeria nada e tornava o material inutilizável para decidir.
	 */
	'name',
	'occupation',
	'photo_url',
	'appliedTime',
	'finishedTime',
	'dateSelect',
	'companyOwner',
	'userApplied',
	'jobApplied',
	'likes',
	'totalLikes',
	'totalDislikes',
	'finished',
	'candidateStatus',
	'isPracticing',
	'typeInterview',
	/*
	 * COMO a entrevista foi feita. Sem isto o destinatário vê um player de áudio
	 * e procura o vídeo que não existe — entrevista por WhatsApp é respondida
	 * por voz, e a tela precisa dizer isso em vez de deixar parecer defeito.
	 */
	'interviewMode',
	'job',
	'leveljob',
	'candidateName',
	'jobName',
	'jobDescription',
	'jobLevel',
	'jobResponsibilities',
	'jobRequirements',
	'language',
	'evaluationLanguage',
] as const

/** Campos de nota top-level gated por `score`. */
const JOB_APPLIED_SCORE_FIELDS = ['score', 'scom', 'sres', 'stec'] as const

/** Campos textuais top-level gated por `feedback`. */
const JOB_APPLIED_FEEDBACK_FIELDS = ['recomentation'] as const

/** Campos analíticos top-level gated por `analysis`. */
const JOB_APPLIED_ANALYSIS_FIELDS = ['nivel_confianca', 'profundidade', 'requisitos_atendidos'] as const

/**
 * Cuts an already-masked (credit-level) jobApplied detail down to the
 * sections liberated by a share link. Monta o objeto de saída campo a
 * campo (allowlist) — nunca faz spread do jobApplied de origem, então
 * campos novos/desconhecidos nunca vazam por omissão.
 */
export function stripInterviewDetail(
	jobAppliedResult: { jobApplied: Record<string, unknown> },
	sections: SharedCandidateLinkSections,
): { jobApplied: Record<string, unknown> } {
	const source = jobAppliedResult.jobApplied
	const result: Record<string, unknown> = {}

	for (const field of JOB_APPLIED_BASE_FIELDS) {
		if (field in source) {
			result[field] = source[field]
		}
	}

	if (sections.score) {
		for (const field of JOB_APPLIED_SCORE_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.feedback) {
		for (const field of JOB_APPLIED_FEEDBACK_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	if (sections.analysis) {
		for (const field of JOB_APPLIED_ANALYSIS_FIELDS) {
			if (field in source) result[field] = source[field]
		}
	}

	const avaliacaoFinal = stripAvaliacaoFinal(source.avaliacaoFinal, sections)
	if (avaliacaoFinal) {
		result.avaliacaoFinal = avaliacaoFinal
	}

	if ('interview' in source) {
		const interview = source.interview
		result.interview = interview
			? stripInterview(interview as Record<string, unknown>, sections)
			: null
	}

	if ('whatsappTriagemResult' in source) {
		result.whatsappTriagemResult = stripWhatsappTriagemResult(
			source.whatsappTriagemResult,
			sections,
		)
	}

	if ('exitJobResult' in source) {
		result.exitJobResult = stripExitJobResult(source.exitJobResult, sections)
	}

	return { jobApplied: result }
}
