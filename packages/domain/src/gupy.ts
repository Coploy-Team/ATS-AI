export interface GupyIntegration {
	id: string
	companyId?: string | null

	// Credenciais
	gupyApiToken?: string | null
	companyName?: string | null

	// Config de email
	emailHtmlTemplate?: string | null
	interviewBaseUrl?: string | null

	// Config de step (filtro de webhook) — null = aceita todas as vagas
	stepName?: string | null

	// Config de tags
	sentTagName?: string | null
	sentTagColor?: string | null
	scoreTagPrefix?: string | null
	scoreTagColor?: string | null

	// Config de custom fields Gupy — null = não filtra/não usa
	techTestFieldLabel?: string | null
	techTestFieldValue?: string | null
	careerLevelFieldLabel?: string | null
	defaultCareerLevel?: string | null

	// Config de entrevista
	defaultLanguage?: string | null
	questionCount?: number | null

	// Config pós-entrevista
	sendCommentOnFinish?: boolean | null
	commentTemplate?: string | null
	sendCandidateEmail?: boolean | null
	syncLookbackDays?: number | null
	autoSyncOnFinish?: boolean | null

	// Feature flags
	enabled?: boolean | null
}
