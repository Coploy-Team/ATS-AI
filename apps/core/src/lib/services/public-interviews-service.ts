import { ensureDate, ensureDateWithFallback, timestampToDateWithFallback } from '@/lib/date-formatter'
import { isCourtesyInterview } from '@/lib/saas-courtesy'
import type { InfraProvider } from '@coploy/infra'
import type { Company, PublicInterview, User } from '@coploy/domain'
import type { InterviewTagsDocument } from '@/types/interview-tags'
import type {
	InterviewFilters,
	ProcessedInterview,
	UniqueEmailInterview,
} from '@/types/public-interviews-filters'

export function buildDateFilters(
	startDate?: string,
	endDate?: string,
): Array<{
	field: string
	operator: '>=' | '<='
	value: Date
}> {
	const filters: Array<{ field: string; operator: '>=' | '<='; value: Date }> = []

	if (startDate) {
		filters.push({
			field: 'date',
			operator: '>=',
			value: new Date(startDate),
		})
	}

	if (endDate) {
		filters.push({
			field: 'date',
			operator: '<=',
			value: new Date(endDate),
		})
	}

	return filters
}

export function processInterviewData(
	interviews: PublicInterview[],
): ProcessedInterview[] {
	// ✅ FILTRO ADICIONAL: Garantir que apenas entrevistas do tipo "interview" sejam processadas
	const filteredInterviews = interviews.filter((interview) => {
		const typeInterview = interview.type_interview?.toLowerCase() ?? 'interview'
		return typeInterview === 'interview'
	})

	return filteredInterviews.map((interview) => ({
		...interview,
		date: ensureDateWithFallback(interview.date),
		job_applied_ref: interview.job_applied_ref?.id || null,
		job_ref: interview.job_ref?.id || null,
		user_ref: interview.user_ref?.id || null,
		interview_tags: interview.interview_tags
			? {
					...(interview.interview_tags as InterviewTagsDocument),
					created_at: ensureDate((interview.interview_tags as InterviewTagsDocument).created_at),
				}
			: null,
	}))
}

/**
 * Nota de UMA entrevista, na régua 0–10.
 *
 * A conta estava embutida no agrupamento e passou a ser necessária também para
 * escolher qual entrevista representa a pessoa. Duas cópias divergiriam, e
 * divergir aqui significa a lista ordenar por um número e exibir outro.
 *
 * `score` direto tem precedência sobre `score_geral` das tags, e o zero é
 * valor válido (entrevista finalizada sem análise) — por isso nada de `||`.
 */
export function notaDaEntrevista(interview: {
	score?: string | number | null
	interview_tags?: { resumo_executivo?: { score_geral?: number | null } | null } | null
}): number {
	let direto: number | null = null
	if (typeof interview.score === 'string') {
		const parsed = Number.parseFloat(interview.score)
		direto = Number.isNaN(parsed) ? null : parsed
	} else if (typeof interview.score === 'number' && !Number.isNaN(interview.score)) {
		direto = interview.score
	}

	const geral = interview.interview_tags?.resumo_executivo?.score_geral ?? null

	let nota = 0
	if (direto !== null) nota = direto
	else if (geral !== null && !Number.isNaN(geral)) nota = geral

	// algumas fontes gravam 0–100; a lista inteira fala 0–10
	return nota > 10 ? nota / 10 : nota
}

/**
 * Qual entrevista representa cada pessoa na lista: a de maior nota.
 *
 * Empate resolve pelo id, que é estável — sem isso a pessoa poderia trocar
 * de representante entre duas chamadas e voltar a aparecer duas vezes.
 */
export function escolherRepresentantes(conjunto: ProcessedInterview[]): Map<string, string> {
	const melhor = new Map<string, { id: string; nota: number }>()
	for (const item of conjunto) {
		const pessoa = item.user_ref
		if (!pessoa || !item.id) continue
		const nota = notaDaEntrevista(item)
		const atual = melhor.get(pessoa)
		if (
			!atual ||
			nota > atual.nota ||
			(nota === atual.nota && String(item.id) < String(atual.id))
		) {
			melhor.set(pessoa, { id: item.id, nota })
		}
	}
	return new Map([...melhor].map(([pessoa, { id }]) => [pessoa, id]))
}

function matchesBasicFilters(
	interview: ProcessedInterview,
	filters: InterviewFilters,
): boolean {
	// Filtro por nível de carreira
	if (
		filters.careerLevel !== 'all' &&
		interview.career_level !== filters.careerLevel
	) {
		return false
	}

	// Filtro por estado
	if (filters.state !== 'all') {
		const normalizedRequestedState = filters.state.toUpperCase()
		const normalizedActualState = interview.state?.toUpperCase()
		if (normalizedRequestedState !== normalizedActualState) {
			return false
		}
	}

	// Filtro por cidade
	if (filters.city !== 'all') {
		const normalizedRequestedCity = filters.city.toLowerCase()
		const normalizedActualCity = interview.city?.toLowerCase()
		if (normalizedRequestedCity !== normalizedActualCity) {
			return false
		}
	}

	return true
}

/**
 * Campos do CANDIDATO que a busca varre.
 *
 * `occupation`, `professional_experience` e `academic` faltavam — ou seja, o
 * cargo da pessoa e o currículo dela não eram pesquisáveis. Procurar
 * "desenvolvedor" só achava quem tivesse "desenvolvedor" no nome da VAGA, o que
 * é quase o oposto do que o recrutador quis dizer.
 */
function searchInBasicFields(
	interview: ProcessedInterview | UniqueEmailInterview,
	searchTerm: string,
): boolean {
	const candidate = interview as ProcessedInterview & {
		occupation?: string | null
		professional_experience?: string | null
		academic?: string | null
	}
	return !!(
		candidate.name?.toLowerCase().includes(searchTerm) ||
		candidate.email?.toLowerCase().includes(searchTerm) ||
		candidate.job_name?.toLowerCase().includes(searchTerm) ||
		candidate.external_id?.toLowerCase().includes(searchTerm) ||
		candidate.occupation?.toLowerCase().includes(searchTerm) ||
		candidate.professional_experience?.toLowerCase().includes(searchTerm) ||
		candidate.academic?.toLowerCase().includes(searchTerm)
	)
}

function searchInHardSkills(
	hardSkills: any[] | undefined,
	searchTerm: string,
): boolean {
	return !!hardSkills?.some(
		(skill) =>
			skill?.tag?.toLowerCase().includes(searchTerm) ||
			skill?.evidencia?.toLowerCase().includes(searchTerm) ||
			skill?.contexto_uso?.toLowerCase().includes(searchTerm) ||
			skill?.palavras_chave?.some((palavra: string) =>
				palavra.toLowerCase().includes(searchTerm),
			) ||
			skill?.categoria?.toLowerCase().includes(searchTerm) ||
			skill?.area?.toLowerCase().includes(searchTerm),
	)
}

function searchInSoftSkills(
	softSkills: any[] | undefined,
	searchTerm: string,
): boolean {
	return !!softSkills?.some(
		(skill) =>
			skill?.tag?.toLowerCase().includes(searchTerm) ||
			skill?.evidencia?.toLowerCase().includes(searchTerm) ||
			skill?.contexto?.toLowerCase().includes(searchTerm) ||
			skill?.impacto?.toLowerCase().includes(searchTerm) ||
			skill?.categoria?.toLowerCase().includes(searchTerm),
	)
}

function searchInSenioridade(senioridade: any, searchTerm: string): boolean {
	return !!(
		senioridade?.nivel_identificado?.toLowerCase().includes(searchTerm) ||
		senioridade?.justificativa?.toLowerCase().includes(searchTerm) ||
		senioridade?.fatores_principais?.some((fator: string) =>
			fator.toLowerCase().includes(searchTerm),
		)
	)
}

function searchInMarketFit(marketFit: any, searchTerm: string): boolean {
	return !!(
		marketFit?.tipos_empresa_ideais?.some((tipo: string) =>
			tipo.toLowerCase().includes(searchTerm),
		) ||
		marketFit?.culturas_adequadas?.some((cultura: string) =>
			cultura.toLowerCase().includes(searchTerm),
		) ||
		marketFit?.papeis_potenciais?.some(
			(papel: any) =>
				papel?.papel?.toLowerCase().includes(searchTerm) ||
				papel?.justificativa?.toLowerCase().includes(searchTerm),
		)
	)
}

function searchInGaps(gaps: any, searchTerm: string): boolean {
	const searchInGapArray = (gapArray: any[], searchTerm: string) =>
		gapArray?.some(
			(gap) =>
				gap?.area?.toLowerCase().includes(searchTerm) ||
				gap?.descricao?.toLowerCase().includes(searchTerm) ||
				gap?.recomendacao?.toLowerCase().includes(searchTerm),
		)

	const searchInRedFlags = (redFlags: any[], searchTerm: string) =>
		redFlags?.some(
			(flag) =>
				flag?.tipo?.toLowerCase().includes(searchTerm) ||
				flag?.descricao?.toLowerCase().includes(searchTerm) ||
				flag?.evidencia?.toLowerCase().includes(searchTerm),
		)

	return !!(
		searchInGapArray(gaps?.tecnicos, searchTerm) ||
		searchInGapArray(gaps?.comportamentais, searchTerm) ||
		searchInRedFlags(gaps?.red_flags, searchTerm)
	)
}

function searchInResumoExecutivo(
	resumoExecutivo: any,
	searchTerm: string,
): boolean {
	return !!(
		resumoExecutivo?.pontos_fortes?.some((ponto: string) =>
			ponto.toLowerCase().includes(searchTerm),
		) ||
		resumoExecutivo?.pontos_desenvolvimento?.some((ponto: string) =>
			ponto.toLowerCase().includes(searchTerm),
		) ||
		resumoExecutivo?.recomendacao_final?.toLowerCase().includes(searchTerm)
	)
}

function searchInInterviewTags(
	interview: ProcessedInterview,
	searchTerm: string,
): boolean {
	const tags = interview.interview_tags
	if (!tags) {
		return false
	}

	return !!(
		searchInHardSkills(tags.hard_skills ?? undefined, searchTerm) ||
		searchInSoftSkills(tags.soft_skills ?? undefined, searchTerm) ||
		searchInSenioridade(tags.senioridade, searchTerm) ||
		searchInMarketFit(tags.market_fit, searchTerm) ||
		searchInGaps(tags.gaps, searchTerm) ||
		searchInResumoExecutivo(tags.resumo_executivo, searchTerm) ||
		tags.job_name?.toLowerCase().includes(searchTerm)
	)
}

function searchInAllInterviewTags(
	candidateTags: NonNullable<ProcessedInterview['interview_tags']>[],
	searchTerm: string,
): boolean {
	return candidateTags.some((tag) => {
		if (!tag) {
			return false
		}

		return !!(
			searchInHardSkills(tag.hard_skills ?? undefined, searchTerm) ||
			searchInSoftSkills(tag.soft_skills ?? undefined, searchTerm) ||
			searchInSenioridade(tag.senioridade, searchTerm) ||
			searchInMarketFit(tag.market_fit, searchTerm) ||
			searchInGaps(tag.gaps, searchTerm) ||
			searchInResumoExecutivo(tag.resumo_executivo, searchTerm) ||
			tag.job_name?.toLowerCase().includes(searchTerm)
		)
	})
}

/**
 * Busca por PALAVRA, não por frase inteira.
 *
 * Antes o termo era comparado como uma string só: "profissional proativo"
 * exigia esse par exato em algum campo, e nenhum currículo escreve assim. Cada
 * palavra passou a valer sozinha, e todas precisam aparecer em ALGUM lugar do
 * candidato — o cargo em um campo, a característica no resumo da entrevista,
 * a tecnologia nas skills. É assim que "dev sênior react" funciona.
 *
 * Palavra de até 2 letras é ignorada: "de", "com", "e" apareceriam em tudo e
 * não filtram nada.
 */
function matchesSearchCriteria(
	interview: ProcessedInterview,
	find?: string,
): boolean {
	if (!find) {
		return true
	}

	const terms = find
		.toLowerCase()
		.split(/[\s,;]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 2)

	if (terms.length === 0) return true

	return terms.every(
		(term) => searchInBasicFields(interview, term) || searchInInterviewTags(interview, term),
	)
}

/**
 * Só os filtros BARATOS (nível, estado, cidade).
 *
 * A busca por texto saiu daqui de propósito. Ela roda depois, quando o currículo
 * do candidato já foi lido — cortar antes disso descartaria justamente quem só
 * casa pelo perfil (uma skill declarada, uma certificação), que é a informação
 * mais rica que temos e a que o recrutador mais espera que a busca use.
 *
 * O custo é passar ~3x o tamanho da página pelo enriquecimento em vez do
 * subconjunto já filtrado. Numa busca de talento, que é pontual, isso é barato
 * perto de esconder a pessoa certa.
 */
interface CandidateProfileLike {
	yearsOfExperience?: number | null
	headline?: string | null
	summary?: string | null
	occupation?: string | null
	skills?: string[] | null
	experiences?: Array<{ title?: string | null; company?: string | null; description?: string | null }> | null
	education?: Array<{ institution?: string | null; degree?: string | null; field?: string | null }> | null
	certifications?: Array<{ name?: string | null; issuer?: string | null }> | null
	languages?: Array<{ language?: string | null; proficiency?: string | null }> | null
}

/**
 * Currículo → uma string pesquisável.
 *
 * Tudo que o candidato declarou entra: cargo, headline, resumo, skills, cada
 * experiência (cargo, empresa e descrição), formação, certificações e idiomas.
 * É o "máximo de informação" que temos da pessoa fora da entrevista.
 */
function flattenProfile(profile: CandidateProfileLike): string {
	const parts: Array<string | null | undefined> = [
		profile.headline,
		profile.summary,
		profile.occupation,
		...(profile.skills ?? []),
		...(profile.experiences ?? []).flatMap((item) => [
			item.title,
			item.company,
			item.description,
		]),
		...(profile.education ?? []).flatMap((item) => [
			item.institution,
			item.degree,
			item.field,
		]),
		...(profile.certifications ?? []).flatMap((item) => [item.name, item.issuer]),
		...(profile.languages ?? []).flatMap((item) => [item.language, item.proficiency]),
	]
	return parts.filter(Boolean).join(' · ')
}

export function applyBasicFilters(
	interviews: ProcessedInterview[],
	filters: InterviewFilters,
): ProcessedInterview[] {
	return interviews.filter((interview) => matchesBasicFilters(interview, filters))
}

/**
 * Janela de data, aplicada em memória.
 *
 * O período era filtro da consulta ao Firestore. Como o pool passou a ser lido
 * inteiro (para ordenar pela média), ele precisa ser reaplicado aqui — senão
 * uma busca com período devolveria gente de fora dela.
 */
export function dentroDoPeriodo(
	item: { date?: unknown },
	filters: { startDate?: string; endDate?: string },
): boolean {
	const inicio = filters.startDate ? new Date(filters.startDate) : null
	const fim = filters.endDate ? new Date(filters.endDate) : null
	if (!inicio && !fim) return true
	const data = item.date instanceof Date ? item.date : new Date(String(item.date))
	if (Number.isNaN(data.getTime())) return false
	if (inicio && data < inicio) return false
	if (fim && data > fim) return false
	return true
}

export function calculateEmailInterviewCounts(
	interviews: ProcessedInterview[],
): Record<string, number> {
	return interviews.reduce(
		(counts, interview) => {
			const email = interview.email ?? ''
			counts[email] = (counts[email] || 0) + 1
			return counts
		},
		{} as Record<string, number>,
	)
}

function matchesHardSkillFilters(
	candidateTags: NonNullable<ProcessedInterview['interview_tags']>[],
	filters: InterviewFilters,
): boolean {
	// Filtro por Hard Skill específica
	if (filters.hardSkillTag) {
		const hasSkill = candidateTags.some((tag) =>
			tag?.hard_skills?.some((skill) =>
				skill?.tag?.toLowerCase().includes(filters.hardSkillTag!.toLowerCase()),
			),
		)
		if (!hasSkill) {
			return false
		}
	}

	// Filtro por área de Hard Skill
	if (filters.hardSkillArea) {
		const hasArea = candidateTags.some((tag) =>
			tag?.hard_skills?.some((skill) => skill?.area === filters.hardSkillArea),
		)
		if (!hasArea) {
			return false
		}
	}

	// Filtro por pontuação mínima de Hard Skill
	if (filters.minHardSkillPontuacao) {
		const hasMinScore = candidateTags.some((tag) =>
			tag?.hard_skills?.some(
				(skill) => (skill?.pontuacao ?? 0) >= filters.minHardSkillPontuacao!,
			),
		)
		if (!hasMinScore) {
			return false
		}
	}

	// Filtro por nível de evidência de Hard Skill
	if (filters.hardSkillNivelEvidencia) {
		const hasEvidenceLevel = candidateTags.some((tag) =>
			tag?.hard_skills?.some(
				(skill) => skill?.nivel_evidencia === filters.hardSkillNivelEvidencia,
			),
		)
		if (!hasEvidenceLevel) {
			return false
		}
	}

	return true
}

function matchesSenioridadeFilters(
	candidateTags: NonNullable<ProcessedInterview['interview_tags']>[],
	filters: InterviewFilters,
): boolean {
	// Filtro por nível de senioridade
	if (filters.senioridadeNivel) {
		const hasSeniorityLevel = candidateTags.some(
			(tag) =>
				tag?.senioridade?.nivel_identificado === filters.senioridadeNivel,
		)
		if (!hasSeniorityLevel) {
			return false
		}
	}

	// Filtro por confiança mínima na senioridade
	if (filters.minConfiancaSenioridade) {
		const hasMinConfidence = candidateTags.some(
			(tag) =>
				(tag?.senioridade?.confianca_avaliacao ?? 0) >=
				filters.minConfiancaSenioridade!,
		)
		if (!hasMinConfidence) {
			return false
		}
	}

	return true
}

function matchesMarketFitFilters(
	candidateTags: NonNullable<ProcessedInterview['interview_tags']>[],
	filters: InterviewFilters,
): boolean {
	// Filtro por tipo de empresa ideal
	if (filters.tipoEmpresaIdeal) {
		const hasCompanyType = candidateTags.some((tag) =>
			tag?.market_fit?.tipos_empresa_ideais?.includes(
				filters.tipoEmpresaIdeal!,
			),
		)
		if (!hasCompanyType) {
			return false
		}
	}

	// Filtro por porte de empresa
	if (filters.porteEmpresa) {
		const hasCompanySize = candidateTags.some((tag) =>
			tag?.market_fit?.porte_empresa?.includes(filters.porteEmpresa!),
		)
		if (!hasCompanySize) {
			return false
		}
	}

	return true
}

function matchesScoreFilters(
	candidateTags: NonNullable<ProcessedInterview['interview_tags']>[],
	filters: InterviewFilters,
): boolean {
	// Filtro por score geral mínimo
	if (filters.minScoreGeral) {
		const hasMinGeneralScore = candidateTags.some(
			(tag) =>
				(tag?.resumo_executivo?.score_geral ?? 0) >= filters.minScoreGeral!,
		)
		if (!hasMinGeneralScore) {
			return false
		}
	}

	return true
}

/**
 * A busca por texto, sobre TUDO que sabemos da pessoa.
 *
 * Três fontes, e cada palavra pode casar em qualquer uma delas:
 * o retrato da entrevista (cargo, experiência em texto, formação), o conteúdo
 * das entrevistas (skills avaliadas, resumo executivo, gaps) e o currículo vivo
 * (skills declaradas, headline, resumo, experiências, formação, certificações).
 *
 * Palavra a palavra, e todas precisam aparecer em ALGUM lugar — é assim que
 * "dev sênior react" funciona quando cargo, senioridade e tecnologia vivem em
 * campos diferentes.
 */
function matchesAdvancedSearchCriteria(
	candidate: UniqueEmailInterview,
	filters: InterviewFilters,
): boolean {
	if (!filters.find) {
		return true
	}

	const terms = filters.find
		.toLowerCase()
		.split(/[\s,;]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 2)

	if (terms.length === 0) return true

	const profileText = (candidate.profileText ?? '').toLowerCase()

	return terms.every(
		(term) =>
			searchInBasicFields(candidate, term) ||
			searchInAllInterviewTags(candidate.interview_tags, term) ||
			profileText.includes(term),
	)
}

/**
 * Filtra candidatos baseado nas regras de país da empresa
 * @param candidates - Lista de candidatos
 * @param headquartersCountries - Países sede da empresa (códigos ISO alpha-2)
 * @param evaluateInternationalCandidates - Se a empresa aceita candidatos internacionais
 * @returns Lista filtrada de candidatos
 */
export function filterCandidatesByCompanyCountryRules(
	candidates: UniqueEmailInterview[],
	headquartersCountries?: string[] | null,
	evaluateInternationalCandidates?: boolean,
): UniqueEmailInterview[] {
	// Fallback: Se não há informações de países sede, exibir todos (compatibilidade legada)
	if (!headquartersCountries || headquartersCountries.length === 0) {
		console.log(
			'[filterCandidatesByCompanyCountryRules] Sem países sede definidos, exibindo todos os candidatos (fallback legado)',
		)
		return candidates
	}

	// Normalizar códigos de países para comparação (uppercase)
	const normalizedHeadquartersCountries = headquartersCountries
		.map((country) => country?.toUpperCase())
		.filter((country) => country && country.length > 0)

	if (normalizedHeadquartersCountries.length === 0) {
		console.log(
			'[filterCandidatesByCompanyCountryRules] Países sede inválidos após normalização, exibindo todos (fallback legado)',
		)
		return candidates
	}

	return candidates.filter((candidate) => {
		// Verificar se o candidato tem interesse nos países sede da empresa
		const candidateCountriesOfInterest = candidate.countriesOfInterest || []
		const normalizedCandidateInterests = candidateCountriesOfInterest
			.map((country) => country?.toUpperCase())
			.filter((country) => country && country.length > 0)

		// Verificar se o país de residência do candidato está nos países sede
		const candidateCountryOfResidence =
			candidate.countryOfResidence?.toUpperCase()

		// Verificar se há interseção entre países de interesse do candidato e países sede
		const hasInterestInHeadquarters = normalizedCandidateInterests.some(
			(interestCountry) =>
				normalizedHeadquartersCountries.includes(interestCountry),
		)

		// Verificar se o país de residência do candidato está nos países sede
		const hasResidenceInHeadquarters =
			candidateCountryOfResidence &&
			normalizedHeadquartersCountries.includes(candidateCountryOfResidence)

		// O candidato é relevante se tem interesse OU se reside em um dos países sede
		const isRelevantCandidate =
			hasInterestInHeadquarters || hasResidenceInHeadquarters

		// Se não tem interesse nem residência em nenhum país sede, filtrar
		if (!isRelevantCandidate) {
			return false
		}

		// Se a empresa NÃO aceita candidatos internacionais
		if (evaluateInternationalCandidates === false) {
			// Verificar se o país de residência do candidato está nos países sede
			if (!candidateCountryOfResidence) {
				// Se não tem país de residência, filtrar (só aceita se for do país sede)
				return false
			}

			// Só aceita se o país de residência for um dos países sede
			if (!hasResidenceInHeadquarters) {
				return false
			}
		}

		// Se chegou aqui, o candidato atende aos critérios
		return true
	})
}

/**
 * Anos de experiência, do currículo do candidato.
 *
 * Roda aqui e não em `applyBasicFilters` porque só neste ponto o currículo já
 * foi lido — a projeção do hunting é um retrato da entrevista e não carrega o
 * campo. Quem não tem o perfil preenchido NÃO é cortado: ausência de dado não é
 * prova de pouca experiência, e cortar por isso esconderia justamente quem
 * ainda não completou o cadastro.
 */
function matchesExperienceFilter(
	candidate: UniqueEmailInterview,
	filters: InterviewFilters,
): boolean {
	if (!filters.minYearsExperience) return true
	const years = candidate.yearsOfExperience
	if (years === null || years === undefined) return true
	return years >= filters.minYearsExperience
}

export function applyAdvancedFilters(
	candidates: UniqueEmailInterview[],
	filters: InterviewFilters,
): UniqueEmailInterview[] {
	return candidates.filter((candidate) => {
		const candidateTags = candidate.interview_tags

		return (
			matchesAdvancedSearchCriteria(candidate, filters) &&
			matchesHardSkillFilters(candidateTags, filters) &&
			matchesSenioridadeFilters(candidateTags, filters) &&
			matchesMarketFitFilters(candidateTags, filters) &&
			matchesScoreFilters(candidateTags, filters) &&
			matchesExperienceFilter(candidate, filters)
		)
	})
}

function formatInterviewForResponse(interview: UniqueEmailInterview) {
	// Defensivo: docs legados (e algumas variações entre adaptadores) podem ter
	// `professional_experience` em snake_case (legado C# Firestore) ou `professionalExperience`
	// em camelCase (formato novo do TS). Fallback null garante que o response schema
	// (`z.string().nullable()`) sempre passa, mesmo quando o doc original não traz a chave.
	const raw = interview as UniqueEmailInterview & {
		professional_experience?: string | null
		professionalExperience?: string | null
	}
	return {
		...interview,
		professional_experience:
			raw.professional_experience ?? raw.professionalExperience ?? null,
		interview_tags: interview.interview_tags.map((tag) => ({
			...tag,
			created_at: ensureDate(tag.created_at),
		})),
	}
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPublicInterviewsService(infra: InfraProvider) {

	/**
	 * Busca uma "página" de public_interviews via cursor por SCORE desc.
	 *
	 * Cursor-based: NÃO faz full scan. Cada chamada lê `limit + 1` docs do
	 * Firestore (índice composto `type_interview + score_value desc`).
	 *
	 * Cursor agora é o **docId** do último item da página anterior — o adapter
	 * GCP usa `startAfter(snapshot)`, que delega o tiebreaker para o docId
	 * implícito do Firestore. Necessário pra lidar com vários docs no mesmo
	 * `score_value` (ex: muitos com score=0): cursor numérico antigo
	 * `where('<', value)` excluía todos os docs no boundary e perdia candidatos
	 * com nota baixa.
	 *
	 * Docs legados sem `score_value` ficam invisíveis até serem backfillados via
	 *   POST /admin/public-interviews/backfill-score-value
	 */
	async function fetchPublicInterviewsInternal(
		startDate?: string,
		endDate?: string,
		cursor?: string,
		limit = 12,
	): Promise<PublicInterview[]> {
		const dateFilters = buildDateFilters(startDate, endDate)

		const typeInterviewFilter = {
			field: 'type_interview',
			operator: '==' as const,
			value: 'interview',
		}

		const allFilters = [...dateFilters, typeInterviewFilter]

		return infra.candidateRepository.listPublicInterviews({
			filters: allFilters.map((f) => ({
				field: f.field,
				operator: f.operator as '==' | '>=' | '<=',
				value: f.value,
			})),
			orderByField: 'score_value',
			orderDirection: 'desc',
			startAfterCursor: cursor,
			limitTo: limit,
		}) as Promise<PublicInterview[]>
	}

	/*
	 * Pool inteiro em memória, por 2 minutos.
	 *
	 * A lista é POR PESSOA e a nota é a MÉDIA das entrevistas dela — então a
	 * ordenação também tem de ser pela média, e média não existe como campo no
	 * Firestore. Paginar por `score_value` (a nota de UMA entrevista) e exibir a
	 * média fazia ordem e número contarem histórias diferentes: o primeiro card
	 * mostrava 2,8 e o segundo 9,1.
	 *
	 * Ler tudo é viável porque a coleção é pequena (centenas), e já existe
	 * precedente no próprio código (`getCandidateDetails` lê com limitTo 1000).
	 * O cache evita repetir a leitura a cada filtro digitado. Quando o pool
	 * passar de alguns milhares, a saída é gravar a média em cada doc no
	 * fechamento da entrevista e voltar a paginar no banco.
	 */
	const CACHE_TTL_MS = 2 * 60 * 1000
	let poolCache: { lido: number; dados: PublicInterview[] } | null = null

	async function carregarPoolCompleto(): Promise<PublicInterview[]> {
		const agora = Date.now()
		if (poolCache && agora - poolCache.lido < CACHE_TTL_MS) return poolCache.dados

		const dados = (await infra.candidateRepository.listPublicInterviews({
			filters: [{ field: 'type_interview', operator: '==', value: 'interview' }],
			orderByField: 'score_value',
			orderDirection: 'desc',
			limitTo: 5000,
		})) as PublicInterview[]

		poolCache = { lido: agora, dados }
		return dados
	}

	/** Média das entrevistas de cada pessoa, na régua 0–10. */
	function calcularMediaPorPessoa(pool: ProcessedInterview[]): Map<string, number> {
		const notas = new Map<string, number[]>()
		for (const item of pool) {
			const pessoa = item.user_ref || item.email
			if (!pessoa) continue
			const lista = notas.get(pessoa) ?? []
			lista.push(notaDaEntrevista(item))
			notas.set(pessoa, lista)
		}
		return new Map(
			[...notas].map(([pessoa, lista]) => [
				pessoa,
				lista.reduce((soma, nota) => soma + nota, 0) / lista.length,
			]),
		)
	}

	/**
	 * Todas as entrevistas públicas das pessoas de um lote.
	 *
	 * Falha aqui NÃO derruba a lista: sem o conjunto completo o agrupamento
	 * volta a ser por lote — a repetição antiga —, que é ruim mas é melhor do
	 * que a tela em branco. O erro fica no log para não sumir em silêncio.
	 */
	async function carregarEntrevistasDasPessoas(
		userIds: string[],
		filters: InterviewFilters,
	): Promise<ProcessedInterview[]> {
		if (userIds.length === 0) return []
		try {
			const brutas = (await infra.candidateRepository.listPublicInterviewsByUsers(
				userIds,
			)) as PublicInterview[]

			/*
			 * A MESMA régua da lista, inclusive a data.
			 *
			 * O período é aplicado na consulta do Firestore, não em
			 * `applyBasicFilters` — se o conjunto da pessoa não o repetisse, o
			 * representante poderia ser uma entrevista fora da janela, que nunca
			 * aparece em página nenhuma. A pessoa então sumiria da busca com
			 * filtro de data: um defeito bem pior que a repetição que estou
			 * consertando.
			 */
			return applyBasicFilters(processInterviewData(brutas), filters).filter((item) =>
				dentroDoPeriodo(item, filters),
			)
		} catch (erro) {
			console.warn('[hunting] conjunto por pessoa indisponível, agrupando só pelo lote:', erro)
			return []
		}
	}

	async function createUniqueByEmailInterviewsInternal(
		interviews: ProcessedInterview[],
		emailCounts: Record<string, number>,
		viewerCtx?: {
			companyId: string
			unlockedJobAppliedIds: Set<string>
			viewerCompany: Pick<Company, 'subscriptionTrial'> | null
		},
		/**
		 * Ler o currículo custa uma consulta por pessoa. Só vale quando alguém vai
		 * de fato usá-lo — buscando por texto ou filtrando por anos. Quem está só
		 * navegando a lista não paga por isso.
		 */
		needsProfile = false,
		/**
		 * Todas as entrevistas das pessoas deste lote. Vazio = indisponível, e aí
		 * a média cai de volta para o lote (comportamento antigo) em vez de sumir.
		 */
		conjuntoDaPessoa: ProcessedInterview[] = [],
	): Promise<UniqueEmailInterview[]> {
		// Criar um Set de user_refs únicos para buscar dados dos usuários
		const uniqueUserRefs = new Set<string>()
		interviews.forEach((interview) => {
			if (interview.user_ref) {
				uniqueUserRefs.add(interview.user_ref)
			}
		})

		// Buscar dados de todos os usuários de uma vez
		const usersMap = new Map<
			string,
			{
				countryOfResidence?: string
				countriesOfInterest?: string[]
				displayName?: string
				occupation?: string
				photoUrl?: string
				/**
				 * Currículo vivo (`candidateProfiles`), não o retrato da entrevista.
				 *
				 * O `public_interviews` guarda um snapshot com texto de experiência,
				 * mas não os campos estruturados — e é por isso que "mais de 15 anos"
				 * não tinha como ser exato. O doc do usuário já era lido aqui; o
				 * currículo é uma leitura a mais no mesmo laço, o que troca um custo
				 * pequeno por uma busca que entende o que o recrutador pediu.
				 */
				yearsOfExperience?: number
				declaredSkills?: string[]
				/**
				 * O currículo inteiro achatado em texto, só para a busca.
				 *
				 * Skills, experiências, formação e certificações viram uma string
				 * única porque a pergunta é sempre "essa palavra aparece em algum
				 * lugar da pessoa?" — percorrer cada lista a cada termo daria o mesmo
				 * resultado com mais código.
				 */
				profileText?: string
			}
		>()

		for (const userId of uniqueUserRefs) {
			try {
				const user = await infra.userRepository.getUser(userId) as User | null
				if (user) {
					usersMap.set(userId, {
						countryOfResidence: user.countryOfResidence ?? undefined,
						countriesOfInterest: user.countriesOfInterest ?? undefined,
						/*
						 * Identidade VIVA (nome, cargo, foto).
						 *
						 * `public_interviews` guarda um retrato do momento da entrevista.
						 * A mesma pessoa aparecia como "Henrique HML / CEO" aqui e
						 * "Henrique Cabral / Desenvolvedor Full Stack" na tela de
						 * Candidatos — dois retratos de épocas diferentes do MESMO
						 * `user_ref`. Quem decide quem a pessoa é hoje é o doc dela.
						 *
						 * O usuário já era buscado aqui (para país); só não estava
						 * sendo aproveitado para os campos que a tela mostra.
						 */
						displayName: user.display_name ?? undefined,
						occupation: (user as { occupation?: string }).occupation ?? undefined,
						photoUrl: user.photo_url ?? undefined,
					})
				}

				/*
				 * Currículo separado: falhar aqui não pode custar a linha inteira —
				 * quem não tem perfil preenchido continua aparecendo na busca, só
				 * não responde aos filtros que dependem dele.
				 */
				if (!needsProfile) continue
				try {
					const profile = (await infra.userRepository.getCandidateProfile(
						userId,
					)) as CandidateProfileLike | null
					if (profile) {
						const entry = usersMap.get(userId) ?? {}
						usersMap.set(userId, {
							...entry,
							yearsOfExperience:
								typeof profile.yearsOfExperience === 'number'
									? profile.yearsOfExperience
									: undefined,
							declaredSkills: Array.isArray(profile.skills) ? profile.skills : undefined,
							profileText: flattenProfile(profile),
						})
					}
				} catch {
					/* sem currículo: a pessoa continua na lista */
				}
			} catch (error) {
				console.error(`Erro ao buscar dados do usuário ${userId}:`, error)
			}
		}

		return interviews.reduce((unique, interview) => {
			const emailExists = unique.find((item) => item.email === interview.email)
			if (!emailExists) {
				const allTagsForEmail = interviews
					.filter((int) => int.email === interview.email)
					.map((int) => int.interview_tags)
					.filter((tags) => tags !== null)
					.map((tags) => ({
						...tags,
						created_at: ensureDate(tags.created_at),
					}))

				/*
				 * A média sai do conjunto COMPLETO da pessoa, não do lote.
				 *
				 * Com o lote como base, a mesma conta mostrava 9,7 numa página e 0,0
				 * na seguinte — a média do que calhou de cair ali. O conjunto
				 * completo dá um número só, igual em qualquer página.
				 *
				 * A identidade é o `user_ref`; e-mail é fallback para docs antigos
				 * que não o têm. Casar por e-mail junta contas homônimas e separa a
				 * mesma pessoa que trocou de e-mail.
				 */
				const daPessoa = conjuntoDaPessoa.filter((int) =>
					interview.user_ref
						? int.user_ref === interview.user_ref
						: int.email === interview.email,
				)
				const interviewsForEmail =
					daPessoa.length > 0
						? daPessoa
						: interviews.filter((int) => int.email === interview.email)

				const scores = interviewsForEmail
					.map((int) => notaDaEntrevista(int))
					.filter((score) => !Number.isNaN(score))

				/*
				 * A nota do card é a MÉDIA das entrevistas da pessoa — regra de
				 * produto, confirmada pelo Henrique.
				 *
				 * Cheguei a trocar por "melhor entrevista" porque a lista parecia
				 * embaralhada: a ordenação era pela nota de UMA entrevista
				 * (`score_value` no Firestore) enquanto o card mostrava a média.
				 * O conserto certo era a ordenação, não a métrica — hoje o pool é
				 * ordenado pela própria média, então ordem e número contam a mesma
				 * história.
				 */
				const averageScore =
					scores.length > 0
						? (scores.reduce((soma, nota) => soma + nota, 0) / scores.length).toFixed(2)
						: '0.00'

				// Hunting Opção A: se o viewer (empresa logada, não-enterprise) tem
				// pelo menos uma entrevista finalizada com esse candidato — exceto
				// quando a entrevista foi desbloqueada por crédito ou está dentro
				// da janela de cortesia SaaS (data < subscriptionTrial.startAt) —
				// ocultamos a média (score=null). Não recalculamos com subset;
				// mascarar uma vez é menos vazamento.
				//
				// TODO ranking-leak: o backend ainda usa o score real pra ordenar
				// (`score_value desc`) e filtrar (`minScoreGeral`). Bloqueante NÃO
				// é — vazamento de ORDEM apenas, decidido fora do escopo dessa task.
				let scoreForResponse: string | null = averageScore
				if (viewerCtx) {
					const viewerHasUnmaskedInterview = interviewsForEmail.some((int) => {
						if (int.company_id !== viewerCtx.companyId) return false
						const jaId = int.job_applied_ref
						if (jaId && viewerCtx.unlockedJobAppliedIds.has(jaId)) return false
						if (isCourtesyInterview(viewerCtx.viewerCompany, int.date)) return false
						return true
					})
					if (viewerHasUnmaskedInterview) {
						scoreForResponse = null
					}
				}

				// Buscar dados do usuário
				const userData = interview.user_ref
					? usersMap.get(interview.user_ref)
					: null

				// Aplicar padrão "BR" se os campos não existirem
				const countryOfResidence =
					userData?.countryOfResidence &&
					typeof userData.countryOfResidence === 'string' &&
					userData.countryOfResidence.trim()
						? userData.countryOfResidence
						: 'BR'
				const countriesOfInterest =
					userData?.countriesOfInterest &&
					Array.isArray(userData.countriesOfInterest) &&
					userData.countriesOfInterest.length > 0
						? userData.countriesOfInterest
						: ['BR']

				unique.push({
					...interview,
					// vivo > snapshot; o snapshot fica como fallback do que o doc não tem
					name: userData?.displayName || interview.name,
					occupation: userData?.occupation || interview.occupation,
					yearsOfExperience: userData?.yearsOfExperience ?? null,
					declaredSkills: userData?.declaredSkills ?? null,
					profileText: userData?.profileText ?? null,
					photo_url: userData?.photoUrl || interview.photo_url,
					score: scoreForResponse, // Score médio (null quando mascarado pela Opção A)
					// nunca `undefined`: a pessoa que está na lista conta pelo menos ela
					totalInterviewsByEmail: emailCounts[interview.email ?? ''] ?? 1,
					interview_tags: allTagsForEmail,
					countryOfResidence,
					countriesOfInterest,
				})
			}
			return unique
		}, [] as UniqueEmailInterview[])
	}

	return {
		fetchPublicInterviews: fetchPublicInterviewsInternal,

		createUniqueByEmailInterviews: createUniqueByEmailInterviewsInternal,

		async processPublicInterviews(
			filters: InterviewFilters,
		): Promise<{
			interviews: any[]
			nextCursor: string | null
			hasMore: boolean
		}> {
			const limit = Math.max(1, Math.min(filters.limit ?? 12, 50))

			// Carrega o conjunto de candidatos JÁ DESBLOQUEADOS pela empresa logada
			// uma vez por request — usado pra marcar `isUnlocked` em cada item e/ou
			// filtrar quando `unlockedOnly` está ativo. Lê creditsUsed com isHunting=true.
			const unlockedJobAppliedIds = new Set<string>()
			if (filters.companyId) {
				try {
					const credits = await infra.billingRepository.listCreditsUsed(
						filters.companyId,
						{
							filters: [{ field: 'isHunting', operator: '==', value: true }],
							limitTo: 5000,
						},
					)
					for (const c of credits) {
						if (c.jobApplied) unlockedJobAppliedIds.add(c.jobApplied)
					}
				} catch (err) {
					console.warn('[hunting] Failed to load unlocked credits, falling back to no badges:', err)
				}
			}

			// Janela de cortesia SaaS — entrevistas da empresa do viewer com
			// data < `subscriptionTrial.startAt` saem da regra Opção A (a
			// média do hunting continua visível mesmo quando o candidato
			// passou por essas entrevistas, porque foram pré-onboarding e
			// não consumiram crédito). Sem startAt no doc da empresa,
			// nenhuma entrevista é tratada como cortesia.
			let viewerCompany: Company | null = null
			if (filters.companyId) {
				try {
					viewerCompany = (await infra.companyRepository.getCompany(
						filters.companyId,
					)) as Company | null
				} catch (err) {
					console.warn('[hunting] Failed to load viewer company doc, defaulting to no courtesy exception:', err)
				}
			}
			const viewerCtx = filters.companyId
				? {
					companyId: filters.companyId,
					unlockedJobAppliedIds,
					viewerCompany,
				}
				: undefined

			// Quando o usuário pediu "apenas desbloqueados" e o set está vazio,
			// curto-circuito — não tem sentido paginar Firestore por nada.
			if (filters.unlockedOnly && unlockedJobAppliedIds.size === 0) {
				return { interviews: [], nextCursor: null, hasMore: false }
			}

			const hasFilters =
				(filters.careerLevel && filters.careerLevel !== 'all') ||
				(filters.state && filters.state !== 'all') ||
				(filters.city && filters.city !== 'all') ||
				!!filters.find?.trim()
			const fetchSize = hasFilters ? limit * 3 + 1 : limit + 1

			// Loop interno de "cursor chasing": filtros pós-fetch (career_level,
			// state, city, find, country rules, advanced) podem zerar uma batch
			// inteira quando o usuário busca alguém de score baixo (ex: "joão"
			// rank #100). Sem este loop, o cliente recebia página vazia + hasMore=true
			// e tinha que clicar "Carregar mais" pra encontrar.
			//
			// Limite de iterações protege contra busca sem match em base grande
			// (sem isso, fetch poderia escanear coleção inteira por um término inexistente).
			/*
			 * Uma leitura do pool, ordenação PELA MÉDIA, paginação em memória.
			 *
			 * O cursor virou deslocamento numérico: a ordem agora é calculada
			 * aqui, não no Firestore, então não há docId de onde continuar. O
			 * cliente trata o cursor como opaco, então isso não muda o contrato.
			 */
			const poolBruto = await carregarPoolCompleto()
			const pool = applyBasicFilters(processInterviewData(poolBruto), filters).filter(
				(item) => dentroDoPeriodo(item, filters),
			)
			const mediaPorPessoa = calcularMediaPorPessoa(pool)
			const representantes = escolherRepresentantes(pool)

			/*
			 * Uma linha por pessoa: a entrevista representante (a de maior nota)
			 * é a que carrega vaga, data e tags do card. Quem não tem `user_ref`
			 * (doc antigo) entra por si mesmo.
			 */
			const ordenados = pool
				.filter((item) => {
					if (!item.user_ref) return true
					const representante = representantes.get(item.user_ref)
					return representante === undefined || representante === item.id
				})
				.sort((a, b) => {
					const mediaA = mediaPorPessoa.get(a.user_ref || a.email || '') ?? 0
					const mediaB = mediaPorPessoa.get(b.user_ref || b.email || '') ?? 0
					if (mediaB !== mediaA) return mediaB - mediaA
					// desempate estável: sem isso a ordem muda entre chamadas
					return String(a.id).localeCompare(String(b.id))
				})

			const emailCounts = calculateEmailInterviewCounts(pool)

			/*
			 * Os filtros avançados rodam DEPOIS do agrupamento e podem esvaziar
			 * uma fatia inteira, então continua havendo laço — só que agora ele
			 * caminha sobre um array em memória, sem ida ao banco.
			 */
			const MAX_ITERATIONS = 20
			const accumulated: ReturnType<typeof formatInterviewForResponse>[] = []
			const seenKeys = new Set<string>()
			let offset = Number.parseInt(filters.cursor ?? '0', 10)
			if (!Number.isFinite(offset) || offset < 0) offset = 0
			let iterations = 0

			while (accumulated.length < limit && offset < ordenados.length && iterations < MAX_ITERATIONS) {
				iterations++
				const fatia = ordenados.slice(offset, offset + fetchSize)
				offset += fatia.length

				const uniqueByEmail = await createUniqueByEmailInterviewsInternal(
					fatia,
					emailCounts,
					viewerCtx,
					Boolean(filters.find?.trim() || filters.minYearsExperience),
					pool,
				)
				const finalInterviews = applyAdvancedFilters(uniqueByEmail, filters)
				const filteredByCompanyRules = filterCandidatesByCompanyCountryRules(
					finalInterviews,
					filters.headquartersCountries,
					filters.evaluateInternationalCandidates,
				)

				// Enriquece com `isUnlocked` (cross-join com creditsUsed) e aplica
				// o filtro `unlockedOnly` quando ativo. Feito ANTES do push pra que
				// o limit conte só os que vão pra resposta.
				const enriched = filteredByCompanyRules.map((c) => {
					const jaId = (c as { job_applied_ref?: string | null }).job_applied_ref ?? null
					return {
						...formatInterviewForResponse(c),
						isUnlocked: jaId ? unlockedJobAppliedIds.has(jaId) : false,
					}
				})

				const visible = (
					filters.unlockedOnly ? enriched.filter((c) => c.isUnlocked) : enriched
				).filter((candidate) => {
					// `user_ref` antes do e-mail: é a identidade estável da pessoa
					const key =
						(candidate as { user_ref?: string | null }).user_ref ||
						candidate.email ||
						candidate.id
					if (!key || seenKeys.has(String(key))) return false
					seenKeys.add(String(key))
					return true
				})

				accumulated.push(...visible)
			}

			const hasMore = offset < ordenados.length
			const nextCursor = hasMore ? String(offset) : null

			const sliced = accumulated.slice(0, limit)

			return {
				interviews: sliced,
				nextCursor,
				hasMore,
			}
		},
	}
}

