/**
 * Vocabulário do currículo que o canal MCP escreve — UM lugar só.
 *
 * O core (`candidateProfileWritableSchema`) é quem decide o que o perfil
 * aceita; aqui fica o que o assistente e o formulário do widget precisam
 * saber por cima disso: os valores fechados que a área do candidato usa
 * (modalidade, disponibilidade), os campos que ficam de fora de propósito e
 * os rótulos do formulário de lacunas. O teste de paridade
 * (`__tests__/profile-parity.test.ts`) compara tudo isto com o schema do core
 * e quebra alto quando um campo novo aparece lá sem passar por aqui.
 */

/** Mesmos valores dos botões da área do candidato (`PersonalInfoTab`). */
export const WORK_MODALITIES = ['remote', 'hybrid', 'onsite'] as const
export type WorkModality = (typeof WORK_MODALITIES)[number]

/** Mesmos valores do select da área do candidato. */
export const AVAILABILITIES = ['immediate', '15_days', '30_days', 'negotiable'] as const
export type Availability = (typeof AVAILABILITIES)[number]

/**
 * Campos que o core aceita por PATCH e o assistente NÃO escreve — cada um com
 * o motivo escrito, porque "esqueci" e "decidi" têm que ser distinguíveis.
 */
export const PROFILE_WRITE_EXCLUSIONS: Record<string, string> = {
	cpf: 'Dado sensível: entra só pela área do candidato, nunca ditado numa conversa que fica no histórico do assistente.',
	profession: 'Alias legado de occupation; o core normaliza na entrada. Expor os dois faria o modelo escolher.',
	resumeUrl:
		'É um ARQUIVO: não trafega pelo chat. O caminho é get_resume_upload_link, que manda para a área do candidato.',
}

/**
 * Campos que só entram por update_my_profile, não por import_profile:
 * importação é matéria de currículo, e estes são identidade/contato.
 */
export const UPDATE_ONLY_FIELDS = ['name', 'phone'] as const

export type FormFieldKind = 'text' | 'textarea' | 'select' | 'multi' | 'link'

export interface FormFieldStrings {
	label: string
	hint: string
	/** select/multi: rótulo por valor. */
	options?: Record<string, string>
}

export interface FormFieldSpec {
	kind: FormFieldKind
	/** select/multi: os valores aceitos, na ordem de exibição. */
	values?: readonly string[]
}

/**
 * O que o formulário de lacunas sabe renderizar. Tem que cobrir TODO campo
 * que o core pode devolver em `missingFields`: o `remainingCount` do
 * get_my_profile conta a lista inteira, e um campo sem entrada aqui faria o
 * assistente dizer "faltam seis coisas" e o formulário abrir com duas.
 */
export const PROFILE_FORM_FIELDS: Record<string, FormFieldSpec> = {
	name: { kind: 'text' },
	occupation: { kind: 'text' },
	level: { kind: 'text' },
	headline: { kind: 'text' },
	summary: { kind: 'textarea' },
	bio: { kind: 'textarea' },
	location: { kind: 'text' },
	skills: { kind: 'text' },
	skillDetails: { kind: 'textarea' },
	professionalObjectives: { kind: 'textarea' },
	experiences: { kind: 'text' },
	education: { kind: 'text' },
	languages: { kind: 'text' },
	workModalities: { kind: 'multi', values: WORK_MODALITIES },
	availability: { kind: 'select', values: AVAILABILITIES },
	// Arquivo: o formulário mostra o caminho, não um campo de texto.
	resumeUrl: { kind: 'link' },
}

export const PROFILE_FORM_STRINGS: Record<'pt-BR' | 'en', Record<string, FormFieldStrings>> = {
	'pt-BR': {
		name: { label: 'Nome', hint: 'como você quer ser chamado' },
		occupation: { label: 'Cargo', hint: 'ex.: Desenvolvedor Full Stack' },
		level: { label: 'Nível', hint: 'Júnior, Pleno ou Sênior' },
		headline: { label: 'Resumo em uma linha', hint: 'como você se apresenta' },
		summary: { label: 'Sobre você', hint: 'sua trajetória em poucas linhas' },
		bio: { label: 'Bio curta', hint: 'até 280 caracteres, aparece no seu perfil' },
		location: { label: 'Onde você está', hint: 'cidade/estado ou Remoto' },
		skills: { label: 'Principais tecnologias', hint: 'separe por vírgula' },
		skillDetails: {
			label: 'Nível em cada tecnologia',
			hint: 'uma por linha — ex.: React: avançado',
		},
		professionalObjectives: { label: 'O que você busca', hint: 'seus objetivos de carreira' },
		experiences: { label: 'Experiência mais recente', hint: 'cargo na empresa — ex.: Tech Lead na Coploy' },
		education: { label: 'Formação', hint: 'curso e instituição' },
		languages: { label: 'Idiomas', hint: 'ex.: Inglês avançado' },
		workModalities: {
			label: 'Modalidade de trabalho',
			hint: 'marque todas que aceita',
			options: { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' },
		},
		availability: {
			label: 'Disponibilidade',
			hint: 'quando você pode começar',
			options: {
				immediate: 'Imediata',
				'15_days': 'Em 15 dias',
				'30_days': 'Em 30 dias',
				negotiable: 'A combinar',
			},
		},
		resumeUrl: { label: 'Currículo em PDF', hint: 'o arquivo é anexado na sua área do candidato' },
	},
	en: {
		name: { label: 'Name', hint: 'how you want to be called' },
		occupation: { label: 'Role', hint: 'e.g. Full Stack Developer' },
		level: { label: 'Seniority', hint: 'Junior, Mid or Senior' },
		headline: { label: 'One-line pitch', hint: 'how you introduce yourself' },
		summary: { label: 'About you', hint: 'your career in a few lines' },
		bio: { label: 'Short bio', hint: 'up to 280 characters, shown on your profile' },
		location: { label: 'Where you are', hint: 'city/state or Remote' },
		skills: { label: 'Main technologies', hint: 'comma separated' },
		skillDetails: { label: 'Level per technology', hint: 'one per line — e.g. React: advanced' },
		professionalObjectives: { label: 'What you are looking for', hint: 'your career goals' },
		experiences: { label: 'Most recent experience', hint: 'role at company — e.g. Tech Lead at Coploy' },
		education: { label: 'Education', hint: 'degree and institution' },
		languages: { label: 'Languages', hint: 'e.g. English advanced' },
		workModalities: {
			label: 'Work modality',
			hint: 'tick every one you accept',
			options: { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' },
		},
		availability: {
			label: 'Availability',
			hint: 'when you can start',
			options: {
				immediate: 'Immediately',
				'15_days': 'In 15 days',
				'30_days': 'In 30 days',
				negotiable: 'Negotiable',
			},
		},
		resumeUrl: { label: 'Résumé (PDF)', hint: 'the file is attached in your candidate area' },
	},
}
