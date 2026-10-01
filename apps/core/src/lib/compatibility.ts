/**
 * Compatibilidade candidato × vaga — determinística (COP-11).
 *
 * Regra explícita sobre skills, nível e modalidade, sem modelo. Três razões,
 * decididas em 22/09/2026: é explicável de graça (a tag que não casou É a
 * explicação, e número e tags saem do mesmo cálculo), custa zero por vaga
 * listada, e se audita lendo a regra. Se um dia um modelo entrar, entra por
 * cima disto — esta é a linha de base contra a qual ele se mede.
 *
 * Perfil incompleto NÃO vira compatibilidade baixa: o componente sem dado do
 * lado do candidato sai da conta e vai para `missingProfileData`, e a tela
 * diz que falta dado, não que a pessoa não serve.
 */

export type CompatibilityTagKind = 'skill' | 'level' | 'modality'

export interface CompatibilityTag {
	kind: CompatibilityTagKind
	/** O que a vaga pede, como ela escreveu. */
	label: string
	matched: boolean
}

export type CompatibilityMissingData = 'skills' | 'level' | 'workModalities'

export interface Compatibility {
	/**
	 * 0–100, ou null quando não há como dizer. A conta só vira número com o
	 * componente de skills dos dois lados: nível ou modalidade sozinhos
	 * diriam "100% compatível" com qualquer vaga do mesmo degrau, e isso é
	 * um número que mente.
	 */
	score: number | null
	tags: CompatibilityTag[]
	/** O que o candidato ainda não informou e por isso ficou fora da conta. */
	missingProfileData: CompatibilityMissingData[]
	/** O que a VAGA não informou — sem skills listadas não há comparação. */
	missingJobData: Array<'skills'>
	/** Quantos componentes entraram na conta (skills, nível, modalidade). */
	components: number
}

export interface CompatibilityProfile {
	skills?: string[] | null
	skillDetails?: Array<{ name: string }> | null
	level?: string | null
	workModalities?: string[] | null
}

export interface CompatibilityJob {
	mainSkills?: string | null
	competencias_criticas?: string | null
	carrerLevel?: string | null
	workModality?: string | null
	jobModel?: string | null
}

/** Pesos declarados — a régua, escrita para poder ser lida e batida. */
export const COMPATIBILITY_WEIGHTS = { skills: 0.6, level: 0.25, modality: 0.15 } as const

/**
 * A escada de níveis do formulário de vaga (`job-options.ts` do ATS), com os
 * apelidos que já foram gravados (slug em inglês da v1, minúsculas do v2).
 * Copiada aqui porque o core não importa código de tela; a ordem é o que
 * permite dizer "um degrau acima/abaixo". Escolaridade não é nível.
 */
const LEVEL_LADDER: ReadonlyArray<{ value: string; alias: string[] }> = [
	{ value: 'Estagiário', alias: ['intern', 'estagio', 'estagiario', 'estágio'] },
	{ value: 'Trainee', alias: ['trainee'] },
	{ value: 'Júnior', alias: ['junior', 'jr'] },
	{ value: 'Assistente', alias: ['assistant'] },
	{ value: 'Operacional', alias: ['operational'] },
	{ value: 'Associado', alias: ['associate'] },
	{ value: 'Técnico', alias: ['technician', 'tecnico'] },
	{ value: 'Analista', alias: ['analyst'] },
	{ value: 'Pleno', alias: ['mid', 'mid-level', 'middle', 'pl'] },
	{ value: 'Sênior', alias: ['senior', 'sr'] },
	{ value: 'Especialista', alias: ['specialist'] },
	{ value: 'Consultor Sênior', alias: ['senior consultant', 'consultor senior'] },
	{ value: 'Coordenador', alias: ['coordinator'] },
	{ value: 'Gerente', alias: ['manager'] },
	{ value: 'Gerente de Projetos', alias: ['project manager'] },
	{ value: 'Chefe', alias: ['head', 'chief'] },
	{ value: 'Diretor', alias: ['director'] },
	{ value: 'Diretor de Operações (COO)', alias: ['coo', 'diretor de operacoes'] },
	{ value: 'Diretor Financeiro (CFO)', alias: ['cfo', 'diretor financeiro'] },
	{ value: 'Diretor de Tecnologia (CTO)', alias: ['cto', 'diretor de tecnologia'] },
	{ value: 'Diretor de Marketing (CMO)', alias: ['cmo', 'diretor de marketing'] },
	{ value: 'Diretor Executivo (CEO)', alias: ['ceo', 'diretor executivo'] },
]

const MODALITIES: ReadonlyArray<{ value: 'remote' | 'hybrid' | 'onsite'; alias: string[] }> = [
	{ value: 'remote', alias: ['remoto', 'remote', 'home office', 'homeoffice'] },
	{ value: 'hybrid', alias: ['hibrido', 'híbrido', 'hybrid'] },
	{ value: 'onsite', alias: ['presencial', 'onsite', 'on-site', 'on site'] },
]

/** Minúsculas, sem acento, sem pontuação nas pontas — o que faz "Sênior" casar com "senior". */
export function normalizeToken(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9+#.\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Índice na escada, ou null para nível desconhecido/não informado. */
export function resolveLevel(raw: string | null | undefined): number | null {
	if (!raw) return null
	const wanted = normalizeToken(raw)
	if (!wanted) return null
	for (let i = 0; i < LEVEL_LADDER.length; i++) {
		const entry = LEVEL_LADDER[i]
		if (normalizeToken(entry.value) === wanted) return i
		if (entry.alias.some((alias) => normalizeToken(alias) === wanted)) return i
	}
	return null
}

export function resolveModality(raw: string | null | undefined): 'remote' | 'hybrid' | 'onsite' | null {
	if (!raw) return null
	const wanted = normalizeToken(raw)
	for (const entry of MODALITIES) {
		if (entry.value === wanted || entry.alias.some((alias) => normalizeToken(alias) === wanted)) {
			return entry.value
		}
	}
	return null
}

/** "Node, React; TypeScript / AWS" → tokens únicos, na ordem em que a vaga escreveu. */
export function splitSkills(...sources: Array<string | null | undefined>): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const source of sources) {
		if (!source) continue
		for (const piece of source.split(/[,;|\n•·]+|\s\/\s/)) {
			const label = piece.replace(/^[\s\-–—*]+|[\s.]+$/g, '').trim()
			if (!label) continue
			const key = normalizeToken(label)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(label)
		}
	}
	return out
}

/**
 * Uma skill do perfil "casa" com a da vaga por igualdade normalizada ou, com
 * ao menos 3 caracteres, por inclusão ("node" ↔ "node.js"). Sem o mínimo, "c"
 * casaria com tudo.
 */
function skillMatches(profileSkill: string, jobSkill: string): boolean {
	const a = normalizeToken(profileSkill)
	const b = normalizeToken(jobSkill)
	if (!a || !b) return false
	if (a === b) return true
	if (a.length >= 3 && b.length >= 3) return a.includes(b) || b.includes(a)
	return false
}

export function computeCompatibility(profile: CompatibilityProfile, job: CompatibilityJob): Compatibility {
	const tags: CompatibilityTag[] = []
	const missing: CompatibilityMissingData[] = []
	let weightUsed = 0
	let sum = 0

	// ── skills ──
	const jobSkills = splitSkills(job.mainSkills, job.competencias_criticas)
	const profileSkills = [
		...(profile.skills ?? []),
		...((profile.skillDetails ?? []).map((s) => s.name)),
	].filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
	if (jobSkills.length > 0) {
		if (profileSkills.length === 0) {
			missing.push('skills')
			for (const label of jobSkills) tags.push({ kind: 'skill', label, matched: false })
		} else {
			let matched = 0
			for (const label of jobSkills) {
				const hit = profileSkills.some((s) => skillMatches(s, label))
				if (hit) matched++
				tags.push({ kind: 'skill', label, matched: hit })
			}
			sum += COMPATIBILITY_WEIGHTS.skills * (matched / jobSkills.length)
			weightUsed += COMPATIBILITY_WEIGHTS.skills
		}
	}

	// ── nível ──
	const jobLevel = resolveLevel(job.carrerLevel)
	if (jobLevel !== null) {
		const profileLevel = resolveLevel(profile.level)
		if (profileLevel === null) {
			missing.push('level')
			tags.push({ kind: 'level', label: job.carrerLevel ?? '', matched: false })
		} else {
			const distance = Math.abs(jobLevel - profileLevel)
			// mesmo degrau casa; um degrau de diferença vale metade — quem é
			// Sênior não deixa de servir a uma vaga Pleno, nem o contrário
			const value = distance === 0 ? 1 : distance === 1 ? 0.5 : 0
			tags.push({ kind: 'level', label: job.carrerLevel ?? '', matched: distance === 0 })
			sum += COMPATIBILITY_WEIGHTS.level * value
			weightUsed += COMPATIBILITY_WEIGHTS.level
		}
	}

	// ── modalidade ──
	const jobModality = resolveModality(job.workModality ?? job.jobModel)
	if (jobModality) {
		const wanted = (profile.workModalities ?? []).map(resolveModality).filter(Boolean)
		const label = job.workModality ?? job.jobModel ?? jobModality
		if (wanted.length === 0) {
			missing.push('workModalities')
			tags.push({ kind: 'modality', label, matched: false })
		} else {
			const hit = wanted.includes(jobModality)
			tags.push({ kind: 'modality', label, matched: hit })
			sum += COMPATIBILITY_WEIGHTS.modality * (hit ? 1 : 0)
			weightUsed += COMPATIBILITY_WEIGHTS.modality
		}
	}

	const skillsCompared = jobSkills.length > 0 && profileSkills.length > 0
	const components = [skillsCompared, jobLevel !== null && resolveLevel(profile.level) !== null, jobModality !== null && (profile.workModalities ?? []).length > 0].filter(Boolean).length

	return {
		// reescala pelo peso usado: componente ausente não vira penalidade —
		// mas sem skills comparadas não há número, só tags
		score: skillsCompared && weightUsed > 0 ? Math.round((sum / weightUsed) * 100) : null,
		tags,
		missingProfileData: missing,
		missingJobData: jobSkills.length === 0 ? ['skills'] : [],
		components,
	}
}
