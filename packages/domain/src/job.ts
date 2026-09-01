import type { EntityRef } from './common'

export interface StructuredJobRequirement {
	id: string
	label: string
	skill?: string
	weight: number
	required: boolean
}

export type ScreeningKnockoutQuestionType = 'boolean' | 'single-choice' | 'number'
export type ScreeningKnockoutRuleOperator =
	| 'equals'
	| 'not_equals'
	| 'greater_than'
	| 'greater_than_or_equal'
	| 'less_than'
	| 'less_than_or_equal'
	| 'in'
	| 'not_in'

export type ScreeningKnockoutRuleValue =
	| string
	| number
	| boolean
	| string[]
	| number[]
	| boolean[]
	| null

export interface ScreeningKnockoutRule {
	operator: ScreeningKnockoutRuleOperator
	value: ScreeningKnockoutRuleValue
}

export interface ScreeningKnockoutNode {
	id: string
	question: string
	type: ScreeningKnockoutQuestionType
	options?: string[] | null
	rule: ScreeningKnockoutRule
	onFail: 'knockout' | 'flag'
	weight?: number | null
}

export interface ScreeningKnockoutTree {
	version: number
	nodes: ScreeningKnockoutNode[]
}

export interface PostJob {
	id: string
	jobId?: string | null
	jobName?: string | null
	identifier?: string | null
	jobDescription?: string | null
	employmentType?: string | null
	carrerLevel?: string | null
	language?: string | null
	typeInterview?: string | null
	/**
	 * Modo de interação da entrevista.
	 * - 'video' (default): fluxo atual, candidato grava vídeo por pergunta.
	 * - 'voice': entrevista conversacional por voz (pipeline Whisper → GPT → TTS).
	 * - 'whatsapp': entrevista via WhatsApp (áudio/texto, transcrito pelo app WhatsApp).
	 * v1: só suportado quando typeInterview === 'interview'.
	 */
	interviewMode?: 'video' | 'voice' | 'whatsapp' | null
	/**
	 * Liga a avaliação de proficiência de idioma dentro de uma entrevista
	 * `typeInterview='interview'`. Quando ausente/false, o fluxo da entrevista
	 * é inalterado (zero mudança de comportamento). `language` define o idioma
	 * avaliado (en, es, fr, it, pt...).
	 */
	evaluateLanguage?: boolean | null
	/**
	 * Marca a vaga como "espelho de perfil": ela não é uma oportunidade real de
	 * uma empresa, e sim a vaga sintética gerada pelo fluxo de entrevista de
	 * perfil do candidato (Dream Jobs), que existe só para dar contexto à
	 * entrevista e publicar o resultado no hunting.
	 *
	 * Consumidores de listagem de vagas (portal, MCP `search_jobs`) DEVEM
	 * excluir `profileInterview === true`, senão o perfil de um candidato
	 * aparece como vaga aberta. Vagas reais não têm o campo (undefined).
	 */
	profileInterview?: boolean | null
	jobResponsabilities?: string | null
	jobResponsibilities?: string | null
	jobRequirements?: string | null
	structuredRequirements?: StructuredJobRequirement[] | null
	knockoutTree?: ScreeningKnockoutTree | null
	jobCategories?: string | null
	jobModel?: string | null
	jobHours?: string | null
	companyName?: string | null
	creatorId?: string | null
	/**
	 * Enviar o retorno automático ao candidato ao finalizar a entrevista.
	 *
	 * Ausente = envia (comportamento de hoje). Quem decide é quem cuida da
	 * vaga: há processo em que o retorno é dado por telefone, e há vaga em que
	 * ele não deve sair automaticamente.
	 *
	 * ⚠️ Desligar tem custo de produto: este e-mail é a promessa anti-ghosting.
	 * O candidato faz a entrevista e não ouve nada — a escolha é do cliente, e
	 * a tela diz isso na hora de desligar.
	 */
	sendCandidateFeedback?: boolean | null
	creatorName?: string | null
	creatorEmail?: string | null
	contractType?: string | null
	screeningObjective?: string | null
	workModality?: string | null
	mainSkills?: string | null
	generatedJobDescription?: string | null
	limitNumberJobVacancies?: string | null
	stopped?: boolean | null
	archived?: boolean | null
	public?: boolean | null
	priority?: boolean | null
	limitedJobVacancy?: boolean | null
	infoJobsBool?: boolean | null
	requiresPreviousExperience?: boolean | null
	minimumAge?: number | null
	timeCreated?: Date | null
	closingDate?: Date | null
	educationalRequiements?: string[] | null
	address?: {
		state?: string | null
		country?: string | null
		city?: string | null
	} | null
	jobDescriptionMetadata?: {
		companyDescription?: string | null
		contractType?: string | null
		benefits?: string | null
		salary?: string | null
		generatedAt?: Date | null
		generatedBy?: string | null
	} | null
	/**
	 * Benefícios e faixa salarial como campos de primeira classe, editáveis no
	 * form (Markdown em `benefits`). Antes só existiam dentro de
	 * `jobDescriptionMetadata`, que apenas o Motor preenchia ao gerar a JD —
	 * ou seja, vaga criada à mão nunca tinha benefício na página pública.
	 * Leitura pública faz fallback pro metadata legado.
	 */
	benefits?: string | null
	salary?: string | null
	/** Creator user-company reference. */
	uid?: EntityRef | null
	/** InfoJobs reference. */
	infoJobs?: EntityRef | null
	/** Notification message reference. */
	uid_notification_message?: EntityRef | null
	usersApplied?: EntityRef[] | null
	jobQuestions?: Array<{
		id?: string
		question?: string | null
		audioUrl?: string | null
		level?: string | null
		peso?: number | null
		skills?: string | null
		finish?: boolean | null
	}> | null
	additionalQuestions?: Array<{
		id?: string
		question?: string | null
		audioUrl?: string | null
		level?: string | null
		peso?: number | null
		skills?: string | null
		finish?: boolean | null
	}> | null
	/** Kanban column configuration per job */
	kanbanConfig?: {
		columns: Array<{ id: string; order: number }>
	} | null
	/** AI evaluation / scoring data */
	evaluation?: Record<string, unknown> | null
	/** Critical competencies for the role */
	competencias_criticas?: string | null
	/** Additional competencies for the role */
	competencias_adicionais?: string | null
	/** Role expectations */
	expectativas?: string | null
	/**
	 * Anti-ghosting (TOS-026). Default `true` só em vagas NOVAS — sem backfill.
	 * Ausente/undefined em vagas legadas = comportamento inalterado (no-op).
	 */
	antiGhostingEnabled?: boolean | null
	/** SLA em horas para ack/decisão (default 24 em vagas novas). */
	feedbackSlaHours?: number | null
	/** Quando a vaga entrou em irregularidade (> limiar). Null = regular. */
	slaIrregularSince?: Date | null
	/** Timestamp do alerta de SLA enviado ao recrutador. */
	slaAlertSentAt?: Date | null
	/** Quando a vaga foi auto-`stopped` pelo job de SLA. */
	slaAutoStoppedAt?: Date | null
	/** Marca que o `stopped` atual foi aplicado pelo anti-ghosting (permite religar). */
	slaAutoStoppedByAntiGhosting?: boolean | null
	/** Valor de `public` antes do auto-stop (restaurado ao regularizar). */
	slaPublicBeforeAutoStop?: boolean | null

	// ── Ghost job (V2-604, GAP 9) ────────────────────────────
	/**
	 * Intenção real de contratação, declarada pela empresa e **mostrada ao
	 * candidato**. 18–22% das vagas do mercado são ghost job e 3 em 5
	 * candidatos desconfiam — declarar não custa nada a quem está contratando
	 * de verdade, e custa caro a quem não está.
	 *
	 * Ausente = vaga anterior ao campo. A tela do candidato não afirma nada
	 * nesse caso: silêncio é honesto, "imediata" por default seria mentira.
	 */
	hiringIntent?: HiringIntent | null
	/**
	 * Unidade organizacional dona da vaga (V2-502).
	 *
	 * Vaga não pertence só à empresa: pertence a uma área, um departamento, um
	 * centro de custo. Sem este vínculo, `/companies/org-units` era um cadastro
	 * que nada consumia — não havia relatório por área nem orçamento por CC, que
	 * é justamente o que a estrutura organizacional existe para permitir.
	 */
	orgUnitId?: string | null
	/**
	 * Valores dos campos que a EMPRESA definiu (`/companies/custom-fields`).
	 *
	 * Chave é o `key` do campo. Toda empresa tem um dado próprio — matrícula,
	 * turno, requisição no SAP — e sem onde guardá-lo o cliente ou não migra ou
	 * enfia tudo na descrição da vaga.
	 */
	customFieldValues?: Record<string, unknown> | null
	/**
	 * Dias sem movimentação até a vaga ser pausada automaticamente (V2-604).
	 * Diferente do SLA de resposta, que olha candidato parado: aqui é a VAGA
	 * parada — ninguém entra, ninguém avança, e o anúncio segue no ar.
	 */
	freshnessSlaDays?: number | null
	/** Última movimentação real da vaga (candidatura nova ou mudança de etapa). */
	lastActivityAt?: Date | null
	/** Quando a vaga foi pausada por falta de frescor. Null = nunca. */
	freshnessPausedAt?: Date | null

	// ── Taxonomia (V2-803) ───────────────────────────────────
	/**
	 * Ocupação canônica resolvida a partir do texto do cargo — gravada **ao
	 * lado** dele, nunca no lugar. O texto original é o que a empresa escreveu e
	 * o que o candidato lê; o código é insumo de busca e ranking. Substituir um
	 * pelo outro perderia a intenção de quem publicou.
	 */
	occupationCode?: string | null
	/** Versão da taxonomia usada — permite reprocessar sem perder o original. */
	taxonomyVersion?: string | null
}

/**
 * Intenção de contratação (V2-604).
 *
 * O conjunto é curto de propósito: cada opção tem consequência diferente para
 * o candidato, e uma lista longa vira escolha ao acaso.
 */
export const HIRING_INTENTS = [
	/** Vaga aberta com contratação prevista agora. */
	'immediate',
	/** Banco de talentos: guarda o perfil, sem posição aberta hoje. */
	'talent_pool',
	/** Pipeline futuro: posição prevista, ainda não aprovada. */
	'future_pipeline',
] as const

export type HiringIntent = (typeof HIRING_INTENTS)[number]

/** Default de vaga NOVA. Sem backfill: vaga legada continua sem declaração. */
export const DEFAULT_FRESHNESS_SLA_DAYS = 30

export interface InfoJob {
	id: string
	name?: string | null
	finishText?: string | null
	finishVideo?: string | null
	welcomeText?: string | null
	welcomeVideo?: string | null
}

export interface JobPortal {
	id: string
	company_id?: string | null
	bannerUrl?: string | null
	/**
	 * Posição vertical do recorte do banner, 0–100 (% do object-position).
	 * O banner raramente tem a proporção da faixa — a empresa escolhe QUAL
	 * fatia aparece (o gesto de arrastar a capa, como no YouTube). 50 = centro.
	 */
	bannerPosition?: number | null
	defaultDomainUrl?: string | null
	logoUrl?: string | null
	primaryColor?: string | null
	textColor?: string | null
	isProfileVisible?: boolean | null
	/**
	 * Presença da empresa fora do portal — fecha a página da vaga com "conheça
	 * mais" (padrão de mercado). Só URLs; rede sem link configurado não aparece.
	 */
	socialLinks?: {
		website?: string | null
		linkedin?: string | null
		instagram?: string | null
		facebook?: string | null
		glassdoor?: string | null
	} | null
	/**
	 * "Sobre a empresa" em Markdown — aparece na home do portal e no fecho da
	 * página da vaga. Distinto do `companyDescription` que o Motor grava por
	 * vaga: este é da EMPRESA, escrito uma vez na configuração do portal.
	 */
	about?: string | null
	/** Vídeo institucional (URL YouTube/Vimeo); embed na home e na página da vaga. */
	videoUrl?: string | null
}

export interface InterviewWhatsapp {
	id: string
	jobId?: string | null
	companyId?: string | null
	typeInterview?: string | null
}
