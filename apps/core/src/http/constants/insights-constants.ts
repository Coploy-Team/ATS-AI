// Idiomas suportados
export const SUPPORTED_LANGUAGES = [
	'pt-BR',
	'en-US',
	'es-ES',
	'fr-FR',
	'it-IT',
	'pt-PT',
	'pt',
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// Nomes completos dos idiomas para instruções mais claras
export const LANGUAGE_FULL_NAMES: Record<SupportedLanguage, string> = {
	'pt-BR': 'português (Portuguese)',
	pt: 'português (Portuguese)',
	'en-US': 'inglês (English)',
	'es-ES': 'espanhol (Spanish)',
	'fr-FR': 'francês (French)',
	'it-IT': 'italiano (Italian)',
	'pt-PT': 'português (Portugal)',
}

// Configurações da aplicação
export const INSIGHTS_CONFIG = {
	MIN_INTERVIEWS_REQUIRED: 2,
	CACHE_COLLECTION: 'insightsCache',
} as const

// Endpoints internos usados para buscar dados
export const INTERNAL_ENDPOINTS = {
	INTERVIEWS_BY_JOB: '/dashboard/interviews-by-job',
	INTERVIEWS_BY_TIME: '/dashboard/interviews-by-time',
	DASHBOARD_HOME: '/dashboard/home',
} as const

// Mensagens padrão para casos onde não há dados suficientes ou API key
export const STANDARD_RESPONSES: Record<SupportedLanguage, string> = {
	'pt-BR': 'Ainda sem dados suficientes para gerar sugestões.',
	pt: 'Ainda sem dados suficientes para gerar sugestões.',
	'en-US': 'Not enough data to generate suggestions yet.',
	'es-ES': 'Aún no hay suficientes datos para generar sugerencias.',
	'fr-FR': 'Pas encore assez de données pour générer des suggestions.',
	'it-IT': 'Dati insufficienti per generare suggerimenti.',
	'pt-PT': 'Ainda não existem dados suficientes para gerar sugestões.',
}

// Mensagens para quando não há API key configurada
export const NO_API_KEY_RESPONSES: Record<SupportedLanguage, string> = {
	'pt-BR': 'Configuração incompleta: API Key da OpenAI não encontrada.',
	pt: 'Configuração incompleta: API Key da OpenAI não encontrada.',
	'en-US': 'Incomplete configuration: OpenAI API Key not found.',
	'es-ES': 'Configuración incompleta: no se encontró la clave API de OpenAI.',
	'fr-FR': 'Configuration incomplète : clé API OpenAI introuvable.',
	'it-IT': 'Configurazione incompleta: chiave API OpenAI non trovata.',
	'pt-PT': 'Configuração incompleta: API Key da OpenAI não encontrada.',
}

// Instruções específicas para cada idioma na geração de insights
export const LANGUAGE_INSTRUCTIONS: Record<SupportedLanguage, string> = {
	'pt-BR': `IMPORTANTE: Você DEVE responder APENAS em ${LANGUAGE_FULL_NAMES['pt-BR']}. 
                 Seu insight inteiro deve estar escrito EXCLUSIVAMENTE em ${LANGUAGE_FULL_NAMES['pt-BR']}. 
                 Não use nenhuma palavra em outros idiomas.`,
	pt: `IMPORTANTE: Você DEVE responder APENAS em ${LANGUAGE_FULL_NAMES.pt}. 
                 Seu insight inteiro deve estar escrito EXCLUSIVAMENTE em ${LANGUAGE_FULL_NAMES.pt}. 
                 Não use nenhuma palavra em outros idiomas.`,
	'en-US': `IMPORTANT: You MUST respond ONLY in ${LANGUAGE_FULL_NAMES['en-US']}. 
                 Your entire insight must be written EXCLUSIVELY in ${LANGUAGE_FULL_NAMES['en-US']}. 
                 Do not use any words in other languages.`,
	'es-ES': `IMPORTANTE: DEBE responder SOLO en ${LANGUAGE_FULL_NAMES['es-ES']}. 
                 Su insight completo debe estar escrito EXCLUSIVAMENTE en ${LANGUAGE_FULL_NAMES['es-ES']}.
                 No utilice palabras en otros idiomas.`,
	'fr-FR': `IMPORTANT: Vous DEVEZ répondre UNIQUEMENT en ${LANGUAGE_FULL_NAMES['fr-FR']}.
                 Votre insight entière doit être rédigée EXCLUSIVEMENT en ${LANGUAGE_FULL_NAMES['fr-FR']}.
                 N'utilisez aucun mot dans d'autres langues.`,
	'it-IT': `IMPORTANTE: DEVI rispondere SOLO in ${LANGUAGE_FULL_NAMES['it-IT']}.
                 Il tuo insight deve essere scritto ESCLUSIVAMENTE in ${LANGUAGE_FULL_NAMES['it-IT']}.
                 Non usare parole in altre lingue.`,
	'pt-PT': `IMPORTANTE: DEVE responder APENAS em ${LANGUAGE_FULL_NAMES['pt-PT']}. 
                 Seu insight inteiro deve estar escrito EXCLUSIVAMENTE em ${LANGUAGE_FULL_NAMES['pt-PT']}. 
                 Não use nenhuma palavra em outros idiomas.`,
}

// Exemplos de sugestões para cada idioma
export const EXAMPLES_IN_LANGUAGE: Record<SupportedLanguage, string> = {
	'pt-BR':
		'Exemplo: Considere agendar mais entrevistas pela manhã, já que este período mostrou maior participação dos candidatos.',
	pt: 'Exemplo: Considere agendar mais entrevistas pela manhã, já que este período mostrou maior participação dos candidatos.',
	'en-US':
		'Example: Consider scheduling more interviews in the morning, as this period showed higher candidate participation.',
	'es-ES':
		'Ejemplo: Considere programar más entrevistas por la mañana, ya que este período mostró una mayor participación de los candidatos.',
	'fr-FR':
		'Exemple: Envisagez de programmer plus dentretiens le matin, car cette période a montré une plus grande participation des candidats.',
	'it-IT':
		'Esempio: Consideri programmare più colloqui al mattino, poiché questo periodo ha mostrato una maggiore partecipazione dei candidati.',
	'pt-PT':
		'Exemplo: Considere agendar mais entrevistas durante a manhã, uma vez que este período revelou uma maior participação dos candidatos.',
}

// Mensagens de fallback para erros
export const FALLBACK_MESSAGES: Record<SupportedLanguage, string> = {
	'pt-BR': 'Erro ao gerar insight. Por favor, tente novamente mais tarde.',
	pt: 'Erro ao gerar insight. Por favor, tente novamente mais tarde.',
	'en-US': 'Error generating insight. Please try again later.',
	'es-ES': 'Error al generar insight. Por favor, inténtelo de nuevo más tarde.',
	'fr-FR':
		'Erreur lors de la génération de linsight. Veuillez réessayer plus tard.',
	'it-IT':
		'Errore nella generazione dellinsight. Si prega di riprovare più tardi.',
	'pt-PT': 'Erro ao gerar insight. Por favor, tente novamente mais tarde.',
}

// Helper functions
export const getStandardResponseWithApiKey = (
	language: SupportedLanguage,
): string => {
	return STANDARD_RESPONSES[language]
}
export const getStandardResponseWithoutApiKey = (
	language: SupportedLanguage,
): string => {
	return NO_API_KEY_RESPONSES[language]
}

export const buildSystemPrompt = (
	language: SupportedLanguage,
	basePrompt: string,
): string => {
	return `${basePrompt}

${LANGUAGE_INSTRUCTIONS[language]}

${EXAMPLES_IN_LANGUAGE[language]}

LEMBRE-SE: Sua resposta deve ser um insight relevante baseado nos dados, e OBRIGATORIAMENTE em ${LANGUAGE_FULL_NAMES[language]}.`
}
