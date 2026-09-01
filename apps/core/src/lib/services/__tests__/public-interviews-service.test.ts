import {
	buildDateFilters,
	processInterviewData,
	applyAdvancedFilters,
	applyBasicFilters,
	calculateEmailInterviewCounts,
	filterCandidatesByCompanyCountryRules,
	dentroDoPeriodo,
	notaDaEntrevista,
	escolherRepresentantes,
} from '../public-interviews-service'

// ─── buildDateFilters ─────────────────────────────────────────────────────────

describe('buildDateFilters', () => {
	it('returns empty array when no dates provided', () => {
		expect(buildDateFilters()).toEqual([])
	})

	it('returns only >= filter for startDate', () => {
		const filters = buildDateFilters('2024-01-01')
		expect(filters).toHaveLength(1)
		expect(filters[0]).toMatchObject({ field: 'date', operator: '>=' })
		expect(filters[0].value).toBeInstanceOf(Date)
	})

	it('returns only <= filter for endDate', () => {
		const filters = buildDateFilters(undefined, '2024-12-31')
		expect(filters).toHaveLength(1)
		expect(filters[0]).toMatchObject({ field: 'date', operator: '<=' })
	})

	it('returns both filters when start and end provided', () => {
		const filters = buildDateFilters('2024-01-01', '2024-12-31')
		expect(filters).toHaveLength(2)
		const operators = filters.map((f) => f.operator)
		expect(operators).toContain('>=')
		expect(operators).toContain('<=')
	})
})

// ─── processInterviewData ─────────────────────────────────────────────────────

describe('processInterviewData', () => {
	const makeRaw = (overrides = {}) => ({
		id: 'i-1',
		type_interview: 'interview',
		date: new Date('2024-06-01'),
		job_applied_ref: { id: 'ja-1', path: 'users/u1/jobsApplied/ja-1' },
		job_ref: { id: 'job-1', path: 'jobs/job-1' },
		user_ref: { id: 'u-1', path: 'users/u-1' },
		interview_tags: null,
		...overrides,
	})

	it('includes interviews with type_interview = "interview"', () => {
		const result = processInterviewData([makeRaw()] as never)
		expect(result).toHaveLength(1)
	})

	it('filters out interviews with type_interview = "screening"', () => {
		const result = processInterviewData([makeRaw({ type_interview: 'screening' })] as never)
		expect(result).toHaveLength(0)
	})

	it('filters out interviews with type_interview = "SCREENING" (case-insensitive)', () => {
		const result = processInterviewData([makeRaw({ type_interview: 'SCREENING' })] as never)
		expect(result).toHaveLength(0)
	})

	it('maps job_applied_ref to its id string', () => {
		const result = processInterviewData([makeRaw()] as never)
		expect(result[0].job_applied_ref).toBe('ja-1')
	})

	it('maps job_ref to its id string', () => {
		const result = processInterviewData([makeRaw()] as never)
		expect(result[0].job_ref).toBe('job-1')
	})

	it('maps user_ref to its id string', () => {
		const result = processInterviewData([makeRaw()] as never)
		expect(result[0].user_ref).toBe('u-1')
	})

	it('handles null refs gracefully', () => {
		const result = processInterviewData([
			makeRaw({ job_applied_ref: null, job_ref: null, user_ref: null }),
		] as never)
		expect(result[0].job_applied_ref).toBeNull()
		expect(result[0].job_ref).toBeNull()
		expect(result[0].user_ref).toBeNull()
	})

	it('defaults type_interview=undefined to "interview" (included)', () => {
		const result = processInterviewData([makeRaw({ type_interview: undefined })] as never)
		expect(result).toHaveLength(1)
	})
})

// ─── calculateEmailInterviewCounts ───────────────────────────────────────────

describe('calculateEmailInterviewCounts', () => {
	it('counts occurrences per email', () => {
		const interviews = [
			{ email: 'a@a.com' },
			{ email: 'a@a.com' },
			{ email: 'b@b.com' },
		]
		const counts = calculateEmailInterviewCounts(interviews as never)
		expect(counts['a@a.com']).toBe(2)
		expect(counts['b@b.com']).toBe(1)
	})

	it('returns empty object for empty list', () => {
		expect(calculateEmailInterviewCounts([])).toEqual({})
	})

	it('handles null email as empty string key', () => {
		const counts = calculateEmailInterviewCounts([{ email: null }] as never)
		expect(counts['']).toBe(1)
	})
})

// ─── applyBasicFilters ────────────────────────────────────────────────────────

describe('applyBasicFilters', () => {
	const makeProcessed = (overrides = {}) => ({
		email: 'c@c.com',
		name: 'Candidato',
		jobName: 'Dev',
		external_id: null,
		type_interview: 'interview',
		career_level: 'junior',
		state: 'SP',
		city: 'São Paulo',
		interview_tags: null,
		...overrides,
	})

	it('returns all when filters are "all"', () => {
		const interviews = [makeProcessed(), makeProcessed({ state: 'RJ' })]
		const result = applyBasicFilters(interviews as never, {
			careerLevel: 'all',
			state: 'all',
			city: 'all',
		} as never)
		expect(result).toHaveLength(2)
	})

	it('filters by careerLevel', () => {
		const interviews = [
			makeProcessed({ career_level: 'junior' }),
			makeProcessed({ career_level: 'senior' }),
		]
		const result = applyBasicFilters(interviews as never, {
			careerLevel: 'junior',
			state: 'all',
			city: 'all',
		} as never)
		expect(result).toHaveLength(1)
	})

	it('filters by state (case-insensitive)', () => {
		const interviews = [makeProcessed({ state: 'SP' }), makeProcessed({ state: 'RJ' })]
		const result = applyBasicFilters(interviews as never, {
			careerLevel: 'all',
			state: 'sp',
			city: 'all',
		} as never)
		expect(result).toHaveLength(1)
	})

	it('filters by city (case-insensitive)', () => {
		const interviews = [
			makeProcessed({ city: 'São Paulo' }),
			makeProcessed({ city: 'Rio de Janeiro' }),
		]
		const result = applyBasicFilters(interviews as never, {
			careerLevel: 'all',
			state: 'all',
			city: 'são paulo',
		} as never)
		expect(result).toHaveLength(1)
	})

	/*
	 * A busca por texto SAIU deste estágio de propósito.
	 *
	 * Ela agora roda depois do enriquecimento, quando o currículo do candidato
	 * já foi lido — cortar aqui descartaria quem só casa pelo perfil (uma skill
	 * declarada, uma certificação). Este teste guarda a decisão: se `find`
	 * voltar a filtrar aqui, a busca volta a ignorar o currículo.
	 */
	it('NÃO filtra por texto — isso é do estágio avançado', () => {
		const interviews = [makeProcessed({ name: 'João Silva' }), makeProcessed({ name: 'Maria Souza' })]
		const result = applyBasicFilters(interviews as never, {
			careerLevel: 'all',
			state: 'all',
			city: 'all',
			find: 'joão',
		} as never)
		expect(result).toHaveLength(2)
	})
})

// ─── filterCandidatesByCompanyCountryRules ────────────────────────────────────

describe('filterCandidatesByCompanyCountryRules', () => {
	const makeCandidate = (overrides = {}) => ({
		email: 'c@c.com',
		countryOfResidence: 'BR',
		countriesOfInterest: ['BR'],
		...overrides,
	})

	it('returns all candidates when no headquarters countries defined', () => {
		const candidates = [makeCandidate(), makeCandidate({ countryOfResidence: 'US' })]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, null, true)
		expect(result).toHaveLength(2)
	})

	it('returns all when headquartersCountries is empty array', () => {
		const candidates = [makeCandidate()]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, [], true)
		expect(result).toHaveLength(1)
	})

	it('includes candidate with matching countriesOfInterest', () => {
		const candidates = [
			makeCandidate({ countriesOfInterest: ['BR'], countryOfResidence: 'US' }),
			makeCandidate({ countriesOfInterest: ['CA'], countryOfResidence: 'CA' }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], true)
		expect(result).toHaveLength(1)
		expect((result[0] as any).countriesOfInterest).toContain('BR')
	})

	it('includes candidate with matching countryOfResidence', () => {
		const candidates = [
			makeCandidate({ countryOfResidence: 'BR', countriesOfInterest: ['US'] }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], true)
		expect(result).toHaveLength(1)
	})

	it('excludes candidate with no match in interest or residence', () => {
		const candidates = [
			makeCandidate({ countryOfResidence: 'US', countriesOfInterest: ['CA'] }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], true)
		expect(result).toHaveLength(0)
	})

	it('rejects international candidates when evaluateInternationalCandidates=false and residence mismatch', () => {
		const candidates = [
			// Interested in BR but lives in US — should be rejected if not accepting international
			makeCandidate({ countryOfResidence: 'US', countriesOfInterest: ['BR'] }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], false)
		expect(result).toHaveLength(0)
	})

	it('accepts local candidate when evaluateInternationalCandidates=false', () => {
		const candidates = [
			makeCandidate({ countryOfResidence: 'BR', countriesOfInterest: ['BR'] }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], false)
		expect(result).toHaveLength(1)
	})

	it('is case-insensitive for country codes', () => {
		const candidates = [
			makeCandidate({ countriesOfInterest: ['br'], countryOfResidence: 'br' }),
		]
		const result = filterCandidatesByCompanyCountryRules(candidates as never, ['BR'], true)
		expect(result).toHaveLength(1)
	})
})

/**
 * As duas regras que fazem a busca de talento parecer inteligente ou burra.
 *
 * O Henrique testou "preciso de um profissional proativo" e não veio ninguém:
 * o termo era comparado como frase inteira, e os campos do CURRÍCULO (cargo,
 * experiências, formação) nem eram varridos. Estes testes travam as duas
 * correções, porque qualquer refatoração da busca reintroduz o problema em
 * silêncio — a tela apenas volta a ficar vazia.
 */
describe('busca por talento', () => {
	const person = (overrides = {}) =>
		({
			email: 'a@a.com',
			name: 'Ana',
			job_name: 'Vaga X',
			external_id: null,
			type_interview: 'interview',
			career_level: 'senior',
			state: 'SP',
			city: 'São Paulo',
			occupation: 'Desenvolvedora Full Stack',
			professional_experience: 'Oito anos construindo integrações de pagamento',
			academic: 'Bacharel em Ciência da Computação',
			totalInterviewsByEmail: 1,
			interview_tags: [
				{
					soft_skills: [{ tag: 'Proatividade' }],
					resumo_executivo: {
						pontos_fortes: ['Perfil proativo, assume problema sem esperar direção'],
						pontos_desenvolvimento: [],
						recomendacao_final: 'Recomendado',
					},
				},
			],
			// currículo vivo achatado — o que `flattenProfile` produz
			profileText: 'Kubernetes · Scrum Master certificado · Universidade de São Paulo',
			yearsOfExperience: 8,
			...overrides,
		}) as never

	const search = (find: string, rows = [person()]) =>
		applyAdvancedFilters(rows as never, { find } as never)

	it('acha pelo CARGO da pessoa, não só pelo nome da vaga', () => {
		expect(search('desenvolvedora')).toHaveLength(1)
	})

	it('acha pelo que está no currículo em texto', () => {
		expect(search('pagamento')).toHaveLength(1)
	})

	it('acha pela formação', () => {
		expect(search('computação')).toHaveLength(1)
	})

	it('acha pelo que foi dito na entrevista', () => {
		expect(search('proativo')).toHaveLength(1)
	})

	/* o currículo vivo: skill declarada que não aparece em nenhum outro campo */
	it('acha por skill declarada no perfil', () => {
		expect(search('kubernetes')).toHaveLength(1)
	})

	it('acha por certificação do perfil', () => {
		expect(search('scrum')).toHaveLength(1)
	})

	/*
	 * O caso do relato: as palavras vivem em fontes DIFERENTES — cargo no
	 * retrato da entrevista, característica no resumo, skill no currículo.
	 * Como frase única não casaria em lugar nenhum.
	 */
	it('combina palavras de fontes diferentes', () => {
		expect(search('desenvolvedora proativo kubernetes')).toHaveLength(1)
	})

	it('exige TODAS as palavras — não é um "ou" disfarçado', () => {
		expect(search('desenvolvedora aeronáutica')).toHaveLength(0)
	})

	it('ignora palavra vazia de significado', () => {
		expect(search('com pagamento')).toHaveLength(1)
	})

	it('filtra por anos de experiência do currículo', () => {
		const rows = [person({ yearsOfExperience: 8 }), person({ yearsOfExperience: 20 })]
		expect(applyAdvancedFilters(rows as never, { minYearsExperience: 15 } as never)).toHaveLength(1)
	})

	/*
	 * Ausência de dado não é prova de pouca experiência: cortar por isso
	 * esconderia quem ainda não completou o cadastro.
	 */
	it('não corta quem não declarou os anos', () => {
		const rows = [person({ yearsOfExperience: null })]
		expect(applyAdvancedFilters(rows as never, { minYearsExperience: 15 } as never)).toHaveLength(1)
	})
})


// ─── agrupamento por pessoa (nota estável entre páginas) ─────────────────────

describe('notaDaEntrevista', () => {
	it('prefere o score direto sobre o score_geral das tags', () => {
		expect(
			notaDaEntrevista({
				score: '9.64',
				interview_tags: { resumo_executivo: { score_geral: 85 } },
			}),
		).toBe(9.64)
	})

	it('trata zero como nota válida, não como ausência', () => {
		// entrevista finalizada com desempenho zero existe; cair no score_geral
		// aqui inventaria uma nota que a análise direta não deu
		expect(
			notaDaEntrevista({ score: 0, interview_tags: { resumo_executivo: { score_geral: 5 } } }),
		).toBe(0)
	})

	it('usa score_geral quando não há score direto', () => {
		expect(notaDaEntrevista({ score: null, interview_tags: { resumo_executivo: { score_geral: 8 } } })).toBe(8)
	})

	it('normaliza a régua 0–100 para 0–10', () => {
		expect(notaDaEntrevista({ score: 85, interview_tags: null })).toBe(8.5)
	})

	it('sem nota nenhuma devolve zero', () => {
		expect(notaDaEntrevista({ score: null, interview_tags: null })).toBe(0)
	})
})

describe('escolherRepresentantes', () => {
	const pessoa = (id: string, user_ref: string, score: string) =>
		({ id, user_ref, score, interview_tags: null }) as never

	it('escolhe a entrevista de maior nota de cada pessoa', () => {
		const mapa = escolherRepresentantes([
			pessoa('a', 'u1', '0'),
			pessoa('b', 'u1', '9.8'),
			pessoa('c', 'u1', '9.64'),
			pessoa('d', 'u2', '5'),
		])
		expect(mapa.get('u1')).toBe('b')
		expect(mapa.get('u2')).toBe('d')
	})

	/**
	 * O ponto do conserto: com o agrupamento por lote, a mesma pessoa aparecia
	 * na página 1 (com as notas altas) e de novo na página 2 (com os zeros).
	 * O representante tem de ser o MESMO independentemente da ordem em que as
	 * entrevistas chegam.
	 */
	it('não muda de representante conforme a ordem do lote', () => {
		const entrevistas = [
			pessoa('a', 'u1', '0'),
			pessoa('b', 'u1', '9.8'),
			pessoa('c', 'u1', '0'),
		]
		const direto = escolherRepresentantes(entrevistas)
		const invertido = escolherRepresentantes([...entrevistas].reverse())
		expect(direto.get('u1')).toBe(invertido.get('u1'))
	})

	it('desempata pelo id para não alternar entre notas iguais', () => {
		const mapa = escolherRepresentantes([pessoa('z', 'u1', '7'), pessoa('a', 'u1', '7')])
		expect(mapa.get('u1')).toBe('a')
	})

	it('ignora entrevista sem pessoa — não dá para agrupar o que não tem dono', () => {
		const mapa = escolherRepresentantes([pessoa('a', '', '9')])
		expect(mapa.size).toBe(0)
	})
})


// ─── janela de data aplicada em memória ─────────────────────────────────────

/**
 * O período era filtro da consulta ao Firestore. Como o pool passou a ser lido
 * inteiro (para ordenar pela média da pessoa), ele precisa ser reaplicado em
 * memória — senão uma busca com período devolveria gente de fora dela.
 */
describe('dentroDoPeriodo', () => {
	const item = (iso: string) => ({ date: new Date(iso) })

	it('sem período, tudo passa', () => {
		expect(dentroDoPeriodo(item('2020-01-01'), {})).toBe(true)
	})

	it('corta antes do início e depois do fim', () => {
		const filtros = { startDate: '2026-01-01', endDate: '2026-12-31' }
		expect(dentroDoPeriodo(item('2025-12-31'), filtros)).toBe(false)
		expect(dentroDoPeriodo(item('2026-06-15'), filtros)).toBe(true)
		expect(dentroDoPeriodo(item('2027-01-02'), filtros)).toBe(false)
	})

	it('data inválida fica de fora — não dá para afirmar que está no período', () => {
		expect(dentroDoPeriodo({ date: 'não é data' }, { startDate: '2026-01-01' })).toBe(false)
	})
})
