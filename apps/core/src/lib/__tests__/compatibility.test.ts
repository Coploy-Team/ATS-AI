import { computeCompatibility, resolveLevel, resolveModality, splitSkills } from '../compatibility'

describe('compatibilidade determinística (COP-11)', () => {
	it('quebra a lista de skills da vaga como ela foi escrita', () => {
		expect(splitSkills('Node.js, React; TypeScript / AWS\n- Docker')).toEqual([
			'Node.js',
			'React',
			'TypeScript',
			'AWS',
			'Docker',
		])
		// duplicata por acento/caixa não conta duas vezes
		expect(splitSkills('Sênior, senior', 'SENIOR')).toEqual(['Sênior'])
	})

	it('resolve nível por rótulo, apelido e acento', () => {
		expect(resolveLevel('Pleno')).toBe(resolveLevel('pleno'))
		expect(resolveLevel('Sênior')).toBe(resolveLevel('senior'))
		expect(resolveLevel('intern')).toBe(resolveLevel('Estagiário'))
		expect(resolveLevel('Ensino Superior (Concluído)')).toBeNull()
		expect(resolveLevel(null)).toBeNull()
	})

	it('resolve modalidade nos dois vocabulários', () => {
		expect(resolveModality('Remoto')).toBe('remote')
		expect(resolveModality('hybrid')).toBe('hybrid')
		expect(resolveModality('Presencial')).toBe('onsite')
		expect(resolveModality('CLT')).toBeNull()
	})

	it('número e tags saem do mesmo cálculo: a tag não casada é a explicação', () => {
		const result = computeCompatibility(
			{ skills: ['Node', 'React'], level: 'Pleno', workModalities: ['remote'] },
			{ mainSkills: 'Node.js, React, AWS, Docker', carrerLevel: 'Pleno', workModality: 'Remoto' },
		)
		// skills 2/4 → 0.6*0.5 = 0.30; nível igual → 0.25; modalidade → 0.15  ⇒ 0.70
		expect(result.score).toBe(70)
		expect(result.tags.filter((t) => t.kind === 'skill' && t.matched).map((t) => t.label)).toEqual(['Node.js', 'React'])
		expect(result.tags.filter((t) => t.kind === 'skill' && !t.matched).map((t) => t.label)).toEqual(['AWS', 'Docker'])
		expect(result.missingProfileData).toEqual([])
		expect(result.components).toBe(3)
	})

	it('um degrau de diferença no nível vale metade — Sênior não deixa de servir a vaga Pleno', () => {
		const igual = computeCompatibility({ skills: ['x'], level: 'Pleno' }, { mainSkills: 'x', carrerLevel: 'Pleno' })
		const vizinho = computeCompatibility({ skills: ['x'], level: 'Sênior' }, { mainSkills: 'x', carrerLevel: 'Pleno' })
		const longe = computeCompatibility({ skills: ['x'], level: 'Diretor' }, { mainSkills: 'x', carrerLevel: 'Pleno' })
		expect(igual.score).toBe(100)
		expect(vizinho.score).toBe(85) // 0.6 + 0.25*0.5 = 0.725 / 0.85
		expect(longe.score).toBe(71) // 0.6 / 0.85
	})

	it('perfil incompleto não vira compatibilidade baixa: o componente sai da conta e é nomeado', () => {
		const result = computeCompatibility(
			{ skills: ['Node'] },
			{ mainSkills: 'Node', carrerLevel: 'Pleno', workModality: 'Remoto' },
		)
		// só skills entrou na conta (1/1) — nível e modalidade faltam no perfil
		expect(result.score).toBe(100)
		expect(result.missingProfileData).toEqual(['level', 'workModalities'])
		expect(result.components).toBe(1)
		// as tags continuam lá, marcadas como não casadas, para a tela explicar
		expect(result.tags.map((t) => t.kind)).toEqual(['skill', 'level', 'modality'])
	})

	it('sem nada comparável dos dois lados o score é null, nunca zero', () => {
		const result = computeCompatibility({}, { mainSkills: 'Node' })
		expect(result.score).toBeNull()
		expect(result.missingProfileData).toEqual(['skills'])
		expect(computeCompatibility({ skills: ['Node'] }, {}).score).toBeNull()
		expect(computeCompatibility({ skills: ['Node'] }, {}).missingJobData).toEqual(['skills'])
	})

	it('nível ou modalidade sozinhos não viram número — "100%" com qualquer vaga do mesmo degrau mentiria', () => {
		const result = computeCompatibility(
			{ skills: ['Node'], level: 'Sênior', workModalities: ['remote'] },
			{ carrerLevel: 'Sênior', workModality: 'Remoto' },
		)
		expect(result.score).toBeNull()
		expect(result.missingJobData).toEqual(['skills'])
		// as tags continuam explicando o que casou
		expect(result.tags.map((t) => [t.kind, t.matched])).toEqual([['level', true], ['modality', true]])
	})

	it('"c" não casa com tudo: inclusão só a partir de 3 caracteres', () => {
		const result = computeCompatibility({ skills: ['C'] }, { mainSkills: 'C#, Clojure, C' })
		expect(result.tags.map((t) => [t.label, t.matched])).toEqual([
			['C#', false],
			['Clojure', false],
			['C', true],
		])
	})
})
