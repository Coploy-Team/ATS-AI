import type { InfraProvider } from '@coploy/infra'
import type { CandidateEvaluation, Company, JobApplied, PostJob, UsersCompany } from '@coploy/domain'
import { normalizeStageId } from '@coploy/domain'
import { NotFoundError } from '@coploy/shared/errors'

import { createCompanyCreditsService } from './company-credits'

/**
 * Dossiê do candidato numa vaga — o que a tela de detalhe precisa, numa
 * chamada só.
 *
 * Existe separado de `getCandidateDetails` porque a pergunta é outra:
 * aquele responde "quem é essa pessoa na empresa" (todas as entrevistas
 * dela); este responde "como essa pessoa está NESTA vaga" — que é a
 * decisão que o recrutador toma na tela.
 *
 * O que o dossiê acrescenta e não existia em lugar nenhum:
 *
 * - **contexto comparativo**: a nota sozinha não decide nada. `8,6` só
 *   significa alguma coisa contra a média da vaga e o histórico da empresa
 *   para aquele cargo — é o que o protótipo mostra ao lado do número;
 * - **trilha com tempo por etapa**, incluindo há quanto tempo o candidato
 *   está sem resposta e a mediana da vaga, que é o material do
 *   anti-ghosting;
 * - **skills verificadas × declaradas**: o que a IA confirmou na entrevista
 *   vale mais que o que a pessoa escreveu, e a UI precisa distinguir.
 */

export interface CompetencyScore {
	name: string
	/** 0–10 normalizado — o dado bruto vem em escalas diferentes. */
	score: number
	strengths: string[]
	gaps: string[]
	critical: boolean
}

export interface DossierQuestion {
	id: string
	question: string
	score: number | null
	feedback: string | null
	analyze: string | null
	video: string | null
	audio: string | null
	/** Áudio irrecuperável: nota 0 aqui não é desempenho ruim. */
	skipped: boolean
	/** A pergunta foi respondida (o orchestrator marca ao transcrever). */
	answered: boolean
	/** Transcrição da resposta — o que a pessoa efetivamente disse. */
	answer: string | null
	/** Legendas com marcação de tempo; alimenta o CC do player. */
	captions: Array<{ start: number; end: number; text: string }> | null
	/** Idiomas em que a legenda já foi traduzida (só os suportados pela UI). */
	captionLanguages: string[]
	/**
	 * Legendas traduzidas, por idioma.
	 *
	 * Sem os segmentos a tela só conseguia ANUNCIAR os idiomas disponíveis, o
	 * que virava texto morto: "Traduzido: es, pt-BR, fr" sem lugar nenhum para
	 * trocar. Restrito a pt/en porque é o par que a plataforma inteira fala.
	 */
	captionsByLanguage: Record<string, Array<{ start: number; end: number; text: string }>>
	strengths: string[]
	improvements: string[]
	/**
	 * Autenticidade DESTA resposta: o motor pontua naturalidade, personalização,
	 * complexidade, padrões linguísticos e contexto (0–1) e lista o que
	 * observou. É a evidência que sustenta — ou derruba — o veredito global.
	 */
	authenticity: {
		metrics: {
			naturalness: number | null
			personalization: number | null
			complexity: number | null
			linguisticPatterns: number | null
			context: number | null
		}
		observations: string[]
	} | null
}

/**
 * Análise de autenticidade (detecção de cola).
 *
 * É o que sustenta a promessa da entrevista assíncrona: sem ela, a nota vale
 * o quanto se confia que a pessoa respondeu sozinha. `nivel_confianca` pode
 * vir como "Revisar manualmente" quando o score cai na zona cinzenta e a
 * exemplificação é fraca (ver `cheat-confidence.ts`).
 */
export interface AuthenticitySummary {
	score: number | null
	/** A mesma medida em %, que é como o motor pensa ("44% humano"). */
	humanPercent: number | null
	level: string | null
	summary: string | null
	/** O que puxou a nota pra baixo, em uma linha cada. */
	criticalFactors: string[]
	/** O que soou humano, com o peso que teve no cálculo. */
	indicators: Array<{ label: string; detail: string | null; weight: number | null }>
	signals: Array<{ label: string; detail: string | null; severity: string | null }>
	/** Padrões de escrita/fala repetidos entre respostas. */
	patterns: string[]
	/** Ressalvas do próprio motor — o que ele NÃO consegue afirmar. */
	contextNotes: string[]
}

export interface CandidateDossier {
	/**
	 * Bloqueio SaaS (V2-704). `true` = a empresa ainda não desbloqueou este
	 * candidato. Enterprise nunca vê `true`.
	 */
	locked: boolean
	candidate: {
		id: string
		name: string
		email: string | null
		phone: string | null
		photoUrl: string | null
		occupation: string | null
		headline: string | null
		summary: string | null
		yearsOfExperience: number | null
		location: string | null
		linkedinUrl: string | null
		resumeUrl: string | null
		experiences: Array<Record<string, unknown>>
		education: Array<Record<string, unknown>>
		languages: Array<Record<string, unknown>>
	}
	application: {
		jobAppliedId: string
		jobId: string
		jobName: string | null
		stage: string
		appliedAt: string | null
		stageSince: string | null
		finished: boolean
		/** Perguntas respondidas e total — o progresso de quem parou no meio. */
		answeredCount: number
		questionTotal: number
		rejectionReasonCode: string | null
		rejectionReasonLabel: string | null
		/** A mensagem que o recrutador escreveu ao reprovar — foi no e-mail. */
		rejectionNote: string | null
		rejectionEvidence: string | null
		/** 'knockout' quando foi o filtro automático quem reprovou. */
		rejectionDecisionSource: string | null
		/**
		 * O filtro de candidatura respondido — pergunta, resposta e o que
		 * reprovou. Sem isto o recrutador via "Rejected" sem saber POR QUÊ, e
		 * a tela ainda oferecia reprovar de novo (V2: relato do primeiro teste
		 * real da distribuição open).
		 */
		screeningKnockout: {
			passed: boolean | null
			answers: Array<{
				question: string
				answer: string | number | boolean | null
				failed: boolean
			}>
		} | null
		/**
		 * Prova de entrevista verificada (OTS 0.2) apresentada pelo candidato
		 * no apply e verificada por nós — assinatura do emissor, vínculo de
		 * e-mail e revogação checados no ato. O conteúdo é o que o CANDIDATO
		 * consentiu divulgar (tier), nunca o veredito de outra empresa.
		 */
		otsAttestation: {
			tier: 'existence' | 'summary' | 'full'
			iss: string
			companyName: string | null
			jobTitle: string | null
			completedAt: string
			questionsTotal: number | null
			outcome: {
				score: number | null
				strengths: string[]
				developmentAreas: string[]
			} | null
			verifiedAt: string
			revocationStatus: string
			statusUrl: string
		} | null
	}
	interview: {
		score: number | null
		finishedAt: string | null
		questionCount: number
		durationSeconds: number | null
		summary: string | null
		recommendation: string | null
		strengths: string[]
		developmentAreas: string[]
		suggestions: string[]
		competencies: CompetencyScore[]
		questions: DossierQuestion[]
		languageEvaluation: Record<string, unknown> | null
		authenticity: AuthenticitySummary | null
		/** Idiomas para os quais o resultado já foi traduzido (só pt/en). */
		translations: string[]
		/**
		 * O resultado TRADUZIDO, por idioma.
		 *
		 * O `translationCache` guarda feedback, recomendação, pontos fortes e o
		 * feedback de cada pergunta em outros idiomas. A tela só listava os nomes
		 * dos idiomas — "Traduzido: es, pt-BR, fr" — sem lugar nenhum para
		 * trocar, então a tradução existia e ninguém conseguia ler.
		 */
		translationsByLanguage: Record<
			string,
			{
				summary: string | null
				recommendation: string | null
				strengths: string[]
				developmentAreas: string[]
				/** Conteúdo traduzido por pergunta, na ordem de `questions`. */
				questions: Array<{
					feedback: string | null
					strengths: string[]
					improvements: string[]
					/** Métricas e observações traduzidas desta resposta. */
					authenticity: DossierQuestion['authenticity']
				}>
				/** Autenticidade traduzida — `null` quando ainda não foi gerada. */
				authenticity: AuthenticitySummary | null
			}
		>
	} | null
	/** Contexto da vaga: a nota só significa algo contra o que foi pedido. */
	job: {
		/** `interview` | `evaluation` | `emotional` | `exitJob` | `whatsapp`. */
		typeInterview: string | null
		/** `video` | `voice` | `whatsapp`. */
		interviewMode: string | null
		/** Tag de idioma da vaga (`pt-BR`, `en`, …). */
		language: string | null
		description: string | null
		requirements: string | null
		responsibilities: string | null
		level: string | null
		model: string | null
		contractType: string | null
		mainSkills: string | null
		screeningObjective: string | null
	}
	/** Sem isto a nota é um número solto. */
	benchmark: {
		jobAverage: number | null
		jobCandidates: number
		companyAverage: number | null
		/** Posição na vaga, 1 = melhor. `null` quando não há nota. */
		rankInJob: number | null
		/** Percentil arredondado ("top 5%"), null quando a vaga tem <5 notas. */
		topPercent: number | null
	}
	trail: {
		daysInProcess: number | null
		daysInStage: number | null
		/** Mediana de dias no processo entre os candidatos desta vaga. */
		jobMedianDays: number | null
		slaHours: number | null
		/** Passou do SLA sem decisão — o alerta de ghosting da tela. */
		atRisk: boolean
	}
	/** Skills que a IA confirmou na entrevista vs. as declaradas no perfil. */
	skills: {
		name: string
		verified: boolean
		/** Nota da skill na entrevista (0-10), quando avaliada. */
		score: number | null
		/** Nível de evidência — o que separa "citou" de "provou". */
		evidenceLevel: string | null
		/** O trecho que serviu de evidência. */
		evidence: string | null
		/** A IA pediu confirmação humana. */
		needsValidation: boolean
		source: 'assessed' | 'mentioned' | 'declared'
	}[]
}

/**
 * Prova OTS pro dossiê: só o snapshot VERIFICADO, sem o JWS bruto — o
 * recrutador vê o que foi consentido e checado; o documento completo fica no
 * JobApplied pra quem quiser re-verificar por conta própria.
 */
function buildOtsAttestationBlock(
	jobApplied: JobApplied | null | undefined,
): CandidateDossier['application']['otsAttestation'] {
	const attestation = jobApplied?.otsAttestation
	if (!attestation) return null
	return {
		tier: attestation.tier,
		iss: attestation.iss,
		companyName: attestation.companyName ?? null,
		jobTitle: attestation.jobTitle ?? null,
		completedAt: attestation.completedAt,
		questionsTotal: attestation.questionsTotal ?? null,
		outcome: attestation.outcome
			? {
					score: attestation.outcome.score ?? null,
					strengths: attestation.outcome.strengths ?? [],
					developmentAreas: attestation.outcome.developmentAreas ?? [],
				}
			: null,
		verifiedAt: attestation.verifiedAt,
		revocationStatus: attestation.revocationStatus,
		statusUrl: attestation.statusUrl,
	}
}

/**
 * Junta o snapshot da árvore (perguntas da época da candidatura) com as
 * respostas e o resultado. O snapshot é a fonte das PERGUNTAS de propósito:
 * a vaga pode ter mudado o filtro depois, e o dossiê precisa mostrar o que
 * foi perguntado NAQUELA candidatura.
 */
function buildScreeningKnockout(
	jobApplied: JobApplied | null | undefined,
): CandidateDossier['application']['screeningKnockout'] {
	const snapshot = jobApplied?.screeningKnockoutTreeSnapshot
	const answers = jobApplied?.screeningKnockoutAnswers as Record<string, unknown> | null | undefined
	if (!snapshot?.nodes?.length || !answers) return null
	const result = jobApplied?.screeningKnockoutResult as
		| { passed?: boolean; failedNodeIds?: string[] }
		| null
		| undefined
	const failed = new Set(result?.failedNodeIds ?? [])
	return {
		passed: result?.passed ?? null,
		answers: snapshot.nodes.map((node) => ({
			question: node.question,
			answer: (answers[node.id] as string | number | boolean | null | undefined) ?? null,
			failed: failed.has(node.id),
		})),
	}
}

function toNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null
	const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'))
	return Number.isFinite(n) ? n : null
}

function toIso(value: unknown): string | null {
	if (!value) return null
	const date =
		value instanceof Date
			? value
			: typeof value === 'object' && value !== null && 'toDate' in value
				? (value as { toDate: () => Date }).toDate()
				: new Date(String(value))
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function daysBetween(from: string | null, to = Date.now()): number | null {
	if (!from) return null
	const start = new Date(from).getTime()
	if (Number.isNaN(start)) return null
	return Math.max(0, Math.round((to - start) / 86_400_000))
}

/**
 * As competências chegam em escalas misturadas: `pontuacao` costuma ser 0–10,
 * mas parte do dado antigo grava 0–1. Normalizar é o que impede a tela de
 * mostrar "0,6" onde deveria estar "6".
 */
function normalizeScore(raw: unknown): number {
	const value = toNumber(raw) ?? 0
	if (value > 0 && value <= 1) return Number((value * 10).toFixed(1))
	return Number(value.toFixed(1))
}

function mapCompetencies(evaluation?: CandidateEvaluation | null): CompetencyScore[] {
	if (!evaluation) return []
	const build = (
		list: CandidateEvaluation['competencias_criticas'],
		critical: boolean,
	): CompetencyScore[] =>
		(list ?? []).map((item) => ({
			name: item.nome?.trim() || '—',
			score: normalizeScore(item.pontuacao ?? item.score),
			strengths: item.pontos_fortes ?? [],
			gaps: item.pontos_desenvolvimento ?? [],
			critical,
		}))

	return [
		...build(evaluation.competencias_criticas, true),
		...build(evaluation.competencias_adicionais, false),
	]
}

/**
 * Normaliza a análise de cola do engine.
 *
 * O formato bruto (`resumo_executivo` + listas soltas) é do motor, não da UI.
 * Sinal sem rótulo humano não ajuda ninguém a decidir, então o que não tiver
 * descrição fica de fora em vez de virar linha vazia.
 */
/** Lista de strings tolerante: o motor às vezes devolve item único. */
function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
	return typeof value === 'string' && value.trim() ? [value] : []
}

function mapAuthenticity(
	cheat: Record<string, unknown> | null | undefined,
): AuthenticitySummary | null {
	if (!cheat) return null

	const resumo = (cheat.resumo_executivo ?? {}) as Record<string, unknown>
	const detalhada = (cheat.analise_detalhada ?? {}) as Record<string, unknown>

	const raw = toNumber(resumo.pontuacao_autenticidade)
	// o engine grava 0–1; a UI fala a mesma escala de nota da entrevista
	const score = raw === null ? null : raw <= 1 ? Number((raw * 10).toFixed(1)) : raw
	const humanPercent = raw === null ? null : Math.round(raw <= 1 ? raw * 100 : raw * 10)

	/*
	 * ⚠️ As chaves são `analise_detalhada.sinais_suspeitos` e
	 * `.indicadores_autenticidade`.
	 *
	 * A versão anterior procurava por `indicadores`/`alertas`/`sinais` na RAIZ
	 * do objeto — nenhuma delas existe. O resultado é que toda entrevista
	 * aparecia "sem sinal detalhado", e a tela acusava uso de IA sem mostrar as
	 * evidências que o motor tinha produzido o tempo todo.
	 */
	const signals: AuthenticitySummary['signals'] = []
	for (const entry of Array.isArray(detalhada.sinais_suspeitos) ? detalhada.sinais_suspeitos : []) {
		if (typeof entry === 'string') {
			signals.push({ label: entry, detail: null, severity: null })
			continue
		}
		const item = (entry ?? {}) as Record<string, unknown>
		const label = (item.tipo ?? item.titulo ?? item.nome) as string | undefined
		if (!label) continue
		signals.push({
			label,
			detail: (item.descricao ?? item.detalhe ?? null) as string | null,
			severity: (item.severidade ?? item.nivel ?? null) as string | null,
		})
	}

	const indicators: AuthenticitySummary['indicators'] = []
	for (const entry of Array.isArray(detalhada.indicadores_autenticidade)
		? detalhada.indicadores_autenticidade
		: []) {
		if (typeof entry === 'string') {
			indicators.push({ label: entry, detail: null, weight: null })
			continue
		}
		const item = (entry ?? {}) as Record<string, unknown>
		const label = (item.tipo ?? item.titulo ?? item.nome) as string | undefined
		if (!label) continue
		indicators.push({
			label,
			detail: (item.descricao ?? null) as string | null,
			weight: toNumber(item.peso),
		})
	}

	return {
		score,
		humanPercent,
		level: (resumo.nivel_confianca ?? null) as string | null,
		summary: (resumo.parecer_principal ?? resumo.conclusao ?? resumo.resumo ?? null) as
			| string
			| null,
		criticalFactors: toStringList(resumo.fatores_criticos),
		indicators,
		signals,
		patterns: toStringList(detalhada.padroes_identificados),
		contextNotes: toStringList(detalhada.consideracoes_contextuais),
	}
}

/**
 * Métricas de autenticidade por resposta, indexadas pela ordem da pergunta.
 *
 * O motor numera a partir de 1 (`numero_pergunta`); as perguntas chegam na
 * mesma ordem em `interview.info`.
 */
function mapAuthenticityByQuestion(
	cheat: Record<string, unknown> | null | undefined,
): Map<number, DossierQuestion['authenticity']> {
	const map = new Map<number, DossierQuestion['authenticity']>()
	const list = cheat?.analise_por_resposta
	if (!Array.isArray(list)) return map

	for (const entry of list) {
		const item = (entry ?? {}) as Record<string, unknown>
		const index = toNumber(item.numero_pergunta)
		if (index === null) continue
		const metrics = (item.metricas ?? {}) as Record<string, unknown>
		map.set(index, {
			metrics: {
				naturalness: toNumber(metrics.naturalidade),
				personalization: toNumber(metrics.personalizacao),
				complexity: toNumber(metrics.complexidade),
				linguisticPatterns: toNumber(metrics.padroes_linguisticos),
				context: toNumber(metrics.contexto),
			},
			observations: toStringList(item.observacoes),
		})
	}
	return map
}

/**
 * pt e en, só.
 *
 * O motor traduz para vários idiomas, mas a plataforma inteira (UI, e-mails,
 * dashboard) fala apenas português e inglês — oferecer "fr" numa tela que não
 * existe em francês é prometer o que não se entrega.
 */
const SUPPORTED_CAPTION_LANGUAGES = ['pt', 'en']

function captionBase(language: string): string {
	return language.toLowerCase().split(/[-_]/)[0]
}

function supportedCaptionLanguages(translations: unknown): string[] {
	return Object.entries((translations ?? {}) as Record<string, unknown>)
		.filter(
			([language, value]) =>
				Array.isArray(value) &&
				value.length > 0 &&
				SUPPORTED_CAPTION_LANGUAGES.includes(captionBase(language)),
		)
		.map(([language]) => language)
}

function pickSupportedCaptions(
	translations: unknown,
): Record<string, Array<{ start: number; end: number; text: string }>> {
	const out: Record<string, Array<{ start: number; end: number; text: string }>> = {}
	for (const language of supportedCaptionLanguages(translations)) {
		out[language] = (translations as Record<string, unknown>)[language] as Array<{
			start: number
			end: number
			text: string
		}>
	}
	return out
}

/**
 * Traduções do resultado, restritas aos idiomas da plataforma.
 *
 * Mesma régua das legendas: a UI existe em pt e en, oferecer "fr" é prometer
 * uma leitura que o resto da tela não acompanha.
 */
function mapTranslations(
	cache: unknown,
): Record<
	string,
	{
		summary: string | null
		recommendation: string | null
		strengths: string[]
		developmentAreas: string[]
		questions: Array<{
			feedback: string | null
			strengths: string[]
			improvements: string[]
			authenticity: DossierQuestion['authenticity']
		}>
		authenticity: AuthenticitySummary | null
	}
> {
	const out: Record<
		string,
		{
			summary: string | null
			recommendation: string | null
			strengths: string[]
			developmentAreas: string[]
			questions: Array<{
				feedback: string | null
				strengths: string[]
				improvements: string[]
				authenticity: DossierQuestion['authenticity']
			}>
			authenticity: AuthenticitySummary | null
		}
	> = {}

	for (const [language, value] of Object.entries((cache ?? {}) as Record<string, unknown>)) {
		if (!SUPPORTED_CAPTION_LANGUAGES.includes(captionBase(language))) continue
		const entry = (value ?? {}) as Record<string, unknown>
		const translated = (entry.interview ?? {}) as Record<string, unknown>
		const evaluation = (entry.avaliacaoFinal ?? {}) as Record<string, unknown>
		const byQuestion = mapAuthenticityByQuestion(entry.cheat as Record<string, unknown> | undefined)

		out[language] = {
			summary: (evaluation.generalFeedback ?? translated.generalFeedback ?? null) as string | null,
			recommendation: (evaluation.generalRecomendation ?? translated.recomentation ?? null) as
				| string
				| null,
			strengths: toStringList(translated.generalStrengths),
			developmentAreas: toStringList(translated.generalImprovement),
			questions: (Array.isArray(translated.info) ? translated.info : []).map((item, index) => {
				const entry2 = (item ?? {}) as Record<string, unknown>
				return {
					feedback: (entry2.feedback ?? null) as string | null,
					strengths: toStringList(entry2.strengths),
					improvements: toStringList(entry2.improvement),
					// as observações por resposta vivem no cheat traduzido, não no info
					authenticity: byQuestion.get(index + 1) ?? null,
				}
			}),
			// a partir do contrato 0.19 a tradução inclui o bloco de autenticidade
			authenticity: mapAuthenticity(entry.cheat as Record<string, unknown> | undefined),
		}
	}
	return out
}

function median(values: number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function createCandidateDossierService(infra: InfraProvider) {
	const { getPaidUserIdsForCandidates } = createCompanyCreditsService(infra)

	/**
	 * Bloqueio SaaS (V2-704).
	 *
	 * O modelo vigente cobra por **visualização de candidato**, com entrevistas
	 * ilimitadas: enterprise tem contrato mensal e não vê bloqueio nenhum; SaaS
	 * libera o dossiê mediante crédito.
	 *
	 * ⚠️ Esta rota nasceu SEM a máscara que `/companies/interviews` já aplicava —
	 * ou seja, a tela nova do ATS entregava de graça o que a v1 cobrava. Fail
	 * **closed**: erro ao ler a empresa ou os créditos mantém o bloqueio, porque
	 * o inverso vaza receita e dado.
	 */
	async function isUnlocked(params: {
		companyId: string
		userId: string | null
		jobAppliedId: string | null
	}): Promise<boolean> {
		const company = (await Promise.resolve(
			infra.companyRepository.getCompany(params.companyId),
		).catch(() => null)) as Company | null

		const plan =
			company?.subscriptionPlan ??
			(company?.subscriptionDetails as { plan?: string } | null | undefined)?.plan
		// enterprise: contrato fechado por mês, sem bloqueio por candidato
		if (plan === 'enterprise') return true

		if (!params.userId || !params.jobAppliedId) return false

		try {
			const paid = await getPaidUserIdsForCandidates(params.companyId, [
				{ id: params.userId, jobApplied: params.jobAppliedId },
			])
			return [...paid].some(
				(item) => item.id === params.userId && item.jobApplied === params.jobAppliedId,
			)
		} catch {
			return false
		}
	}

	return {
		async getDossier(params: {
			companyId: string
			jobId: string
			/** Id do candidato no board (doc de `companyInterviews`). */
			candidateId: string
		}): Promise<CandidateDossier> {
			const { companyId, jobId, candidateId } = params

			const interviewDoc = (await infra.candidateRepository
				.getJobInterview(companyId, jobId, candidateId)
				.catch(() => null)) as Record<string, unknown> | null

			if (!interviewDoc) throw new NotFoundError('Candidate not found in this job')

			const userId =
				(interviewDoc.user_ref as { path?: string } | undefined)?.path?.split('/').pop() ?? null
			const jobAppliedId =
				(interviewDoc.job_applied_ref as { path?: string } | undefined)?.path
					?.split('/')
					.pop() ?? null

			const [job, jobApplied, user, profile, peers] = await Promise.all([
				infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
				userId && jobAppliedId
					? (infra.candidateRepository
							.getJobApplied(userId, jobAppliedId)
							.catch(() => null) as Promise<JobApplied | null>)
					: Promise.resolve(null),
				userId
					? (infra.userRepository.getUser(userId).catch(() => null) as Promise<UsersCompany | null>)
					: Promise.resolve(null),
				userId
					? infra.userRepository.getCandidateProfile(userId).catch(() => null)
					: Promise.resolve(null),
				infra.candidateRepository
					// o benchmark precisa da vaga inteira, não da primeira página
					.listJobInterviews(companyId, jobId, { limitTo: 500 })
					.catch(() => []),
			])

			const interview = jobApplied?.interview ?? null
			// `avaliacaoFinal` vive no JobApplied, não dentro de `interview`
			const evaluation = jobApplied?.avaliacaoFinal ?? null
			const score = toNumber(interviewDoc.score ?? interview?.score)

			// ── benchmark: a nota só significa algo comparada ──────────────────
			const peerScores = (peers as Array<Record<string, unknown>>)
				.map((peer) => toNumber(peer.score))
				.filter((value): value is number => value !== null && value > 0)

			const jobAverage =
				peerScores.length > 0
					? Number((peerScores.reduce((a, b) => a + b, 0) / peerScores.length).toFixed(1))
					: null

			const rankInJob =
				score !== null && peerScores.length > 0
					? peerScores.filter((value) => value > score).length + 1
					: null

			const topPercent =
				rankInJob !== null && peerScores.length >= 5
					? Math.max(1, Math.round((rankInJob / peerScores.length) * 100))
					: null

			// ── trilha ─────────────────────────────────────────────────────────
			const appliedAt = toIso(interviewDoc.date ?? jobApplied?.appliedTime)
			const stageSince = toIso(interviewDoc.dateSelect ?? interviewDoc.date) ?? appliedAt
			const peerDays = (peers as Array<Record<string, unknown>>)
				.map((peer) => daysBetween(toIso(peer.date)))
				.filter((value): value is number => value !== null)

			const stage = normalizeStageId(
				(interviewDoc.candidateStatus ?? interviewDoc.candidate_status) as string | undefined,
			)
			const slaHours = toNumber(job?.feedbackSlaHours)
			const daysInStage = daysBetween(stageSince)
			const atRisk =
				slaHours !== null &&
				daysInStage !== null &&
				!['approved', 'hired', 'rejected'].includes(stage) &&
				daysInStage * 24 > slaHours

			/*
			 * ── skills: três níveis de certeza, e o selo mostrava o do meio ──
			 *
			 * "Verificada" queria dizer apenas que a skill foi ASSUNTO de uma
			 * pergunta respondida — alguém podia responder mal e continuar
			 * marcado. Enquanto isso, `interview_tags.hard_skills` guarda a
			 * avaliação de verdade: nota, nível de evidência, o trecho que serviu
			 * de evidência e um sinalizador de que a IA quer validação humana.
			 * Esse dado existia e não aparecia em lugar nenhum do dossiê.
			 *
			 * Evidência é o argumento do produto — currículo diz, entrevista
			 * prova. Mostrar só um selo binário jogava isso fora.
			 */
			const assessed = new Map<
				string,
				{ score: number | null; evidenceLevel: string | null; evidence: string | null; needsValidation: boolean }
			>()
			const tagDocs = (user as { interview_tags?: unknown } | null)?.interview_tags
			for (const tagDoc of Array.isArray(tagDocs) ? tagDocs : []) {
				for (const hard of (tagDoc as { hard_skills?: unknown[] })?.hard_skills ?? []) {
					const skill = hard as {
						tag?: string | null
						pontuacao?: number | null
						nivel_evidencia?: string | null
						evidencia?: string | null
						necessita_validacao?: boolean | null
					}
					const name = skill.tag?.trim()
					if (!name) continue
					const previous = assessed.get(name.toLowerCase())
					// entrevistas diferentes avaliam a mesma skill: fica a melhor nota
					if (previous && (previous.score ?? -1) >= (skill.pontuacao ?? -1)) continue
					assessed.set(name.toLowerCase(), {
						score: typeof skill.pontuacao === 'number' ? skill.pontuacao : null,
						evidenceLevel: skill.nivel_evidencia ?? null,
						evidence: skill.evidencia ?? null,
						needsValidation: skill.necessita_validacao === true,
					})
				}
			}

			// citada numa pergunta: mais fraco que avaliada, mais forte que declarada
			const mentioned = new Set<string>()
			for (const item of interview?.info ?? []) {
				for (const skill of (item.skills ?? '').split(',')) {
					const name = skill.trim()
					if (name) mentioned.add(name)
				}
			}
			const declared: string[] = Array.isArray((profile as { skills?: string[] })?.skills)
				? ((profile as { skills: string[] }).skills ?? [])
				: []

			const seen = new Set<string>()
			const skills: Array<{
				name: string
				verified: boolean
				score: number | null
				evidenceLevel: string | null
				evidence: string | null
				needsValidation: boolean
				source: 'assessed' | 'mentioned' | 'declared'
			}> = []
			const addSkill = (name: string, source: 'assessed' | 'mentioned' | 'declared') => {
				const key = name.toLowerCase()
				if (!name || seen.has(key)) return
				seen.add(key)
				const detail = assessed.get(key)
				skills.push({
					name,
					// `verified` mantido para não quebrar quem já lê o campo
					verified: source !== 'declared',
					score: detail?.score ?? null,
					evidenceLevel: detail?.evidenceLevel ?? null,
					evidence: detail?.evidence ?? null,
					needsValidation: detail?.needsValidation ?? false,
					source,
				})
			}
			for (const tagDoc of Array.isArray(tagDocs) ? tagDocs : []) {
				for (const hard of (tagDoc as { hard_skills?: Array<{ tag?: string | null }> })?.hard_skills ?? []) {
					if (hard.tag?.trim()) addSkill(hard.tag.trim(), 'assessed')
				}
			}
			for (const name of mentioned) addSkill(name, 'mentioned')
			for (const name of declared) addSkill(name, 'declared')

			const authenticityByQuestion = mapAuthenticityByQuestion(interview?.cheat)

			const questions: DossierQuestion[] = (interview?.info ?? []).map((item, index: number) => ({
				id: item.id ?? `q-${index}`,
				question: item.question ?? '',
				score: toNumber(item.score),
				feedback: item.feedback ?? null,
				analyze: item.analyze ?? null,
				video: item.video || null,
				audio: item.audio || null,
				skipped: item.pulou_a_pergunta === true,
				/*
				 * `finished` por pergunta é o que o orchestrator grava quando a
				 * resposta é transcrita. Sem isto a tela não tinha como diferenciar
				 * pergunta sem resposta de pergunta respondida em branco.
				 */
				answered: item.finished === true,
				answer: item.answer ?? null,
				captions: (item.captionSegments as DossierQuestion['captions']) ?? null,
				// idiomas já traduzidos: a UI só oferece o que existe, em vez de
				// prometer tradução e devolver vazio
				captionLanguages: supportedCaptionLanguages(item.captionTranslations),
				captionsByLanguage: pickSupportedCaptions(item.captionTranslations),
				strengths: item.strengths ?? [],
				improvements: item.improvement ?? [],
				// o motor numera a partir de 1
				authenticity: authenticityByQuestion.get(index + 1) ?? null,
			}))

			const profileRecord = (profile ?? {}) as Record<string, unknown>

			const unlocked = await isUnlocked({ companyId, userId, jobAppliedId })

			/*
			 * Bloqueado: some o que a empresa paga para ver — nota, respostas,
			 * transcrição, análise, autenticidade e contato direto. Fica o que
			 * permite DECIDIR se vale desbloquear: nome, cargo, vaga, etapa,
			 * datas. Esconder tudo transformaria a lista num muro e ninguém
			 * compraria crédito às cegas.
			 */
			const maskedInterview = interview
				? {
						score: null,
						finishedAt: toIso(jobApplied?.finishedTime),
						questionCount: questions.length,
						durationSeconds: null,
						summary: null,
						recommendation: null,
						strengths: [],
						developmentAreas: [],
						suggestions: [],
						competencies: [],
						questions: [],
						languageEvaluation: null,
						authenticity: null,
						translations: [],
						translationsByLanguage: {},
					}
				: null

			return {
				/**
				 * `locked` é a resposta à pergunta "posso ver este candidato?".
				 * A tela usa isso para oferecer o desbloqueio em vez de mostrar
				 * campos vazios sem explicação.
				 *
				 * ⚠️ Só bloqueia o que EXISTE. Sem entrevista concluída não há
				 * resultado para comprar — e a tela chegou a oferecer "Desbloquear
				 * com 1 crédito" para quem nem começou a entrevista, com a frase
				 * "A entrevista já foi feita" logo acima. Cobrar por nada é pior que
				 * qualquer tela vazia; a ausência aqui tem explicação própria
				 * ("ainda não entrevistou").
				 */
				locked: !unlocked && interviewDoc.finished === true,
				candidate: {
					id: userId ?? candidateId,
					/*
					 * O doc do USUÁRIO manda — mesma régua da foto, logo abaixo.
					 *
					 * Estava invertido: o espelho vinha primeiro, então o dossiê
					 * mostrava "Henrique HML" para quem hoje se chama "Henrique
					 * Cabral". `||` e não `??` porque o espelho grava string vazia
					 * quando o campo não existia, e vazio precisa cair no fallback.
					 */
					name: (user?.display_name as string) || (interviewDoc.name as string) || '—',
					// contato é parte do que se compra: sem crédito, não sai
					email: unlocked
						? ((user?.email as string) || (interviewDoc.email as string) || null)
						: null,
					phone: unlocked ? ((user?.phone_number as string) ?? null) : null,
					/*
					 * O doc do USUÁRIO manda na foto.
					 *
					 * `companyInterviews.photo_url` é um retrato do momento da
					 * entrevista: quem troca o avatar depois continua aparecendo com a
					 * foto velha, e quem entrou sem foto fica sem para sempre — daí o
					 * mesmo candidato aparecer com avatar numa entrevista e sem em
					 * outra. O snapshot vira fallback.
					 */
					photoUrl: (user?.photo_url as string) || (interviewDoc.photo_url as string) || null,
					// vivo (identidade → currículo) > espelho
					occupation:
						((user as Record<string, unknown> | null)?.occupation as string) ||
						(profileRecord.occupation as string) ||
						(interviewDoc.occupation as string) ||
						null,
					headline: (profileRecord.headline as string) ?? null,
					summary: (profileRecord.summary as string) ?? null,
					yearsOfExperience: toNumber(profileRecord.yearsOfExperience),
					location:
						((user as Record<string, unknown> | null)?.countryOfResidence as string) ?? null,
					linkedinUrl: (profileRecord.linkedinUrl as string) ?? null,
					resumeUrl: (profileRecord.resumeUrl as string) ?? null,
					experiences: (profileRecord.experiences as Array<Record<string, unknown>>) ?? [],
					education: (profileRecord.education as Array<Record<string, unknown>>) ?? [],
					languages: (profileRecord.languages as Array<Record<string, unknown>>) ?? [],
				},
				application: {
					jobAppliedId: jobAppliedId ?? candidateId,
					jobId,
					jobName: job?.jobName ?? null,
					stage,
					appliedAt,
					stageSince,
					/*
					 * Concluída = três fontes, não uma.
					 *
					 * `interviewDoc` é o ESPELHO (`companyInterviews`); registros
					 * anteriores ao campo não o carregam, e ler só ele marcaria
					 * entrevista antiga e completa como "não concluída" — trocando um
					 * defeito por outro maior, porque aí a tela esconderia a nota de
					 * quem tem nota.
					 */
					finished:
						interviewDoc.finished === true ||
						jobApplied?.finished === true ||
						jobApplied?.finishedTime != null,
					/*
					 * Quantas respondeu de quantas. `info[]` tem uma entrada por
					 * pergunta desde a criação da sessão, com `finished` por item — é o
					 * tamanho do array que dá o total, e o filtro que dá o progresso.
					 */
					answeredCount: questions.filter((item) => item.answered).length,
					questionTotal: questions.length,
					rejectionReasonCode:
						(interviewDoc.rejectionReasonCode as string) ??
						jobApplied?.rejectionReasonCode ??
						null,
					rejectionReasonLabel:
						(interviewDoc.rejectionReasonLabel as string) ??
						jobApplied?.rejectionReasonLabel ??
						null,
					rejectionNote:
						(interviewDoc.rejectionNote as string) ?? jobApplied?.rejectionNote ?? null,
					rejectionEvidence:
						(interviewDoc.rejectionEvidence as string) ?? jobApplied?.rejectionEvidence ?? null,
					rejectionDecisionSource:
						(interviewDoc.rejectionDecisionSource as string) ??
						jobApplied?.rejectionDecisionSource ??
						null,
					screeningKnockout: buildScreeningKnockout(jobApplied),
					otsAttestation: buildOtsAttestationBlock(jobApplied),
				},
				interview: !unlocked
					? maskedInterview
					: interview
					? {
							score,
							finishedAt: toIso(jobApplied?.finishedTime),
							questionCount: questions.length,
							// duração não é gravada; a tela deriva do player quando precisa
							durationSeconds: null,
							summary: evaluation?.resumo ?? interview.generalFeedback ?? null,
							recommendation: evaluation?.generalRecomendation ?? interview.recomentation ?? null,
							strengths: evaluation?.recomendacoes?.pontos_fortes ?? [],
							developmentAreas: evaluation?.recomendacoes?.areas_desenvolvimento ?? [],
							suggestions: evaluation?.recomendacoes?.sugestoes_melhoria ?? [],
							competencies: mapCompetencies(evaluation),
							questions,
							languageEvaluation:
								(jobApplied?.languageEvaluation as Record<string, unknown> | null) ?? null,
							authenticity: mapAuthenticity(interview.cheat),
							translations: Object.keys(interview.translationCache ?? {}).filter((language) =>
								SUPPORTED_CAPTION_LANGUAGES.includes(captionBase(language)),
							),
							translationsByLanguage: mapTranslations(interview.translationCache),
						}
					: null,
				job: {
					/*
					 * Tipo e modo da entrevista.
					 *
					 * Quem abre a gravação não tinha como saber se está ouvindo uma
					 * entrevista técnica, uma avaliação ou uma entrevista de
					 * desligamento — nem se foi por vídeo, voz ou WhatsApp. Muda
					 * completamente como se lê a resposta: silêncio em vídeo é
					 * hesitação, em WhatsApp é o canal.
					 *
					 * Vem do jobApplied primeiro (o que de fato aconteceu naquela
					 * entrevista) e da vaga como fallback — a vaga pode ter mudado de
					 * formato depois.
					 */
					typeInterview:
						(jobApplied?.typeInterview as string) || (job?.typeInterview as string) || null,
					interviewMode:
						((jobApplied as { interviewMode?: string } | null)?.interviewMode as string) ||
						(job?.interviewMode as string) ||
						null,
					/** Idioma em que a entrevista foi conduzida (bandeira no header). */
					language: (job?.language as string) || null,
					description: job?.jobDescription ?? null,
					requirements: job?.jobRequirements ?? null,
					responsibilities: job?.jobResponsabilities ?? null,
					level: job?.carrerLevel ?? null,
					model: job?.jobModel ?? null,
					contractType: job?.contractType ?? null,
					mainSkills: job?.mainSkills ?? null,
					screeningObjective: job?.screeningObjective ?? null,
				},
				benchmark: {
					jobAverage,
					jobCandidates: peerScores.length,
					// histórico da empresa exige agregação cross-vaga; entra quando o
					// analytics tiver a materialização — mentir um número aqui seria pior
					companyAverage: null,
					rankInJob,
					topPercent,
				},
				trail: {
					daysInProcess: daysBetween(appliedAt),
					daysInStage,
					jobMedianDays: median(peerDays),
					slaHours,
					atRisk,
				},
				skills,
			}
		},
	}
}
