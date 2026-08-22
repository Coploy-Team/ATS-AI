/**
 * Feature store do candidato (V2-901, F3).
 *
 * Restrição inviolável do deck: **ML clássico self-hosted em CPU**, nada de LLM,
 * nada de serviço externo. E explicável — se não dá para dizer por que o
 * candidato subiu, não entra.
 *
 * ## A lista negativa é o coração disto
 *
 * `FORBIDDEN_FEATURES` não é documentação: é o que o teste trava. Atributo
 * protegido nunca vira feature, nem derivado dele — foto revela raça e idade,
 * bairro é proxy de renda e cor, nome é proxy de gênero e origem. A auditoria de
 * viés (V2-905) mede **resultado** por grupo; ela não autoriza usar o atributo
 * para ranquear, e é justamente por isso que a lista existe separada.
 *
 * Mesma régua do OTS §2.4.4 — coerência entre o que o perfil portátil exporta e
 * o que o modelo consome não é coincidência, é a mesma decisão.
 */

/**
 * Features permitidas. **Allowlist**, não denylist: feature nova precisa ser
 * adicionada aqui de propósito, e a revisão desse commit é o momento de
 * perguntar "isto é proxy de quê?".
 */
export const ALLOWED_FEATURES = [
	/** Nota da entrevista IA, 0–10. */
	'interviewScore',
	/** Média das competências avaliadas, 0–10. */
	'competencyAverage',
	/** Fração dos requisitos tipados da vaga atendidos, 0–1. */
	'requirementCoverage',
	/** Skills canônicas da vaga que o candidato tem, 0–1. */
	'skillOverlap',
	/** Anos de experiência declarados. */
	'yearsOfExperience',
	/** Ocupação canônica do candidato == da vaga. */
	'occupationMatch',
	/** Completude do currículo, 0–1 — mede esforço, não a pessoa. */
	'profileCompleteness',
	/** Nº de perguntas respondidas sobre o total. */
	'answerCompletion',
	/** Pontuação de autenticidade da entrevista, 0–1. */
	'authenticityScore',
	/** Proficiência de idioma avaliada, 0–10, quando a vaga pede. */
	'languageScore',
] as const

export type FeatureName = (typeof ALLOWED_FEATURES)[number]

/**
 * Nunca entram — nem diretamente, nem como derivada.
 *
 * Mantida como lista explícita para o teste poder afirmar sobre ela. "Não
 * usamos" sem uma lista é promessa; com a lista, é verificável.
 */
export const FORBIDDEN_FEATURES = [
	'age',
	'birthDate',
	'gender',
	'race',
	'ethnicity',
	'photoUrl',
	'cpf',
	'maritalStatus',
	'disability',
	'religion',
	'neighborhood',
	'zipCode',
	'name',
	'email',
	'phone',
] as const

export interface CandidateFeatures {
	/** `${jobId}:${jobAppliedId}` — a mesma pessoa em vagas diferentes é outra linha. */
	id: string
	companyId: string
	jobId: string
	jobAppliedId: string
	userId: string
	features: Partial<Record<FeatureName, number>>
	/** Versão da taxonomia usada nas features que dependem dela. */
	taxonomyVersion?: string | null
	computedAt: Date | string
}

/**
 * Rótulo de resultado (V2-902) — o que o modelo aprende.
 *
 * `rejected_knockout` fica separado de `rejected_decision` de propósito:
 * knockout é filtro burocrático (não tinha o certificado, não mora na cidade) e
 * misturá-lo com a decisão humana ensinaria o modelo a reproduzir a burocracia
 * em vez do julgamento.
 */
export const OUTCOME_LABELS = [
	'advanced',
	'hired',
	'rejected_decision',
	'rejected_knockout',
	'pending',
] as const

export type OutcomeLabel = (typeof OUTCOME_LABELS)[number]

export interface CandidateOutcome {
	id: string
	companyId: string
	jobId: string
	jobAppliedId: string
	label: OutcomeLabel
	/** Data do desfecho — permite corte temporal no treino. */
	occurredAt: Date | string
}

/** Rótulo que o treino ignora: ainda não houve desfecho. */
export function isTrainable(label: OutcomeLabel): boolean {
	return label !== 'pending' && label !== 'rejected_knockout'
}
