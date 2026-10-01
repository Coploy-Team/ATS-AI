
export enum ConversationStep {
	// Início da conversa
	StartInterview = 'start_interview', // Início da entrevista, primeira interação
	WaitingInterview = 'waiting_interview', // Usuário aguarda a entrevista ser confirmada

	// Coleta de dados do usuário
	WaitingName = 'waiting_name', // Usuário precisa enviar nome
	WaitingEmail = 'waiting_email', // Usuário precisa enviar email
	WaitingPassword = 'waiting_password', // Usuário precisa enviar senha
	ConfirmPassword = 'confirm_password', // Usuário confirma a senha
	ConfirmInterview = 'confirm_interview', // Usuário confirma a entrevista

	// Durante a entrevista
	AskNextQuestion = 'ask_next_question', // Sistema deve fazer a próxima pergunta
	WaitingAnswer = 'waiting_answer', // Usuário recebeu pergunta e precisa responder
	ConfirmAnswer = 'confirm_answer', // Usuário confirma a resposta

	// Fim da entrevista
	Finished = 'finished', // Todas perguntas respondidas, entrevista encerrada
}

export type ConversationContext = {
	id: string // Telefone como ID (ex: +5511999999999)
	phone: string // Número de telefone do usuário
	step: ConversationStep // Estado atual da conversa
	email: string | null // Email coletado durante cadastro
	password: string | null // Senha coletada durante cadastro (será removida após cadastro)
	interviewId: string | null // ID da entrevista em andamento
	jobId: string | null // ID da vaga
	companyId: string | null // ID da empresa
	currentQuestionId: string | null // ID da pergunta atual da entrevista
	lastMessage: string // Última mensagem enviada pelo usuário
	status: 'active' | 'inactive' | 'blocked' // Status da conversa
	createdAt: Date // Data de criação do contexto
	updatedAt: Date // Data da última atualização
	retryCount: number // Número de tentativas de resposta para pergunta atual
	maxRetries: number // Número máximo de tentativas permitidas
	language?: string // Idioma da entrevista (pt-br, en, es, etc)
}

export type ConversationResponse = {
	reply: string // Mensagem de resposta para o usuário
	action: ConversationAction // Ação que deve ser tomada
	context?: ConversationContext // Contexto atualizado (opcional)
}

export enum ConversationAction {
	AskEmail = 'ask_email',
	AskPassword = 'ask_password',
	NextQuestion = 'next_question',
	RetryAnswer = 'retry_answer',
	Finish = 'finish',
	StartInterview = 'start_interview',
	InvalidInput = 'invalid_input',
	UserBlocked = 'user_blocked',
}
