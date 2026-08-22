// URLs das aplicações
export const DASHBOARD_URLS = {
	INTERVIEW_RESULTS: 'https://dashboard.coploy.io/interview',
	CANDIDATE_INFO: 'https://dashboard.coploy.io/candidate-info',
} as const

// Status da vaga
export const JobStatus = {
	ACTIVE: 'Ativa',
	INACTIVE: 'Inativa',
} as const

// Status do candidato
export const CandidateStatus = {
	PENDING: 'Pending',
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	SELECTED: 'Selected',
} as const

// Mensagens padrão
export const DEFAULT_MESSAGES = {
	UNKNOWN_CANDIDATE: 'Desconhecido',
	DATE_NOT_AVAILABLE: 'Data não disponível',
	CANDIDATE_UNDER_ANALYSIS: 'Candidato em análise.',
	COMPANY_NOT_FOUND: 'Empresa não encontrada',
	NO_INTERVIEWS_FOUND: 'Nenhuma entrevista finalizada encontrada',
} as const

// Configurações do Excel
export const EXCEL_CONFIG = {
	WORKSHEET_NAME: 'Relatório',
	DATE_FORMAT: 'dd/mm/yyyy',
	SCORE_DECIMAL_PLACES: 2,
	AUTO_FILTER: {
		ROWS: { FROM: 1, TO: 1 },
		COLUMNS: { FROM: 1, TO: 14 },
	},
} as const

// Definição das colunas do Excel
export const EXCEL_COLUMNS = [
	{ header: 'Código da vaga', key: 'codigoVaga', width: 15 },
	{
		header: 'Data da requisição',
		key: 'dataRequisicao',
		width: 20,
		style: { numFmt: EXCEL_CONFIG.DATE_FORMAT },
	},
	{ header: 'Link da vaga', key: 'linkDaVaga', width: 30 },
	{ header: 'Vaga', key: 'vaga', width: 30 },
	{ header: 'Status da vaga', key: 'statusVaga', width: 15 },
	{ header: 'Tipo da vaga', key: 'tipoVaga', width: 15 },
	{ header: 'Nome do candidato', key: 'nomeCandidato', width: 30 },
	{ header: 'Nota', key: 'nota', width: 10, style: { numFmt: '0.00' } },
	{
		header: 'Data de realização',
		key: 'dataTeste',
		width: 20,
		style: { numFmt: EXCEL_CONFIG.DATE_FORMAT },
	},
	{ header: 'E-mail do candidato', key: 'emailCandidato', width: 35 },
	{ header: 'Telefone do candidato', key: 'telefoneCandidato', width: 20 },
	{ header: 'Status', key: 'status', width: 15 },
	{
		header: 'Data de seleção',
		key: 'dataSelecao',
		width: 20,
		style: { numFmt: EXCEL_CONFIG.DATE_FORMAT },
	},
	{ header: 'Link do candidato', key: 'linkCandidato', width: 30 },
] as const

// Tipos TypeScript
export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus]
export type CandidateStatusType =
	(typeof CandidateStatus)[keyof typeof CandidateStatus]

// Função helper para gerar URLs
export const generateInterviewResultUrl = (jobId?: string): string => {
	return `${DASHBOARD_URLS.INTERVIEW_RESULTS}/${jobId}`
}

export const generateCandidateInfoUrl = (
	candidateId?: string,
	jobId?: string,
): string => {
	return `${DASHBOARD_URLS.INTERVIEW_RESULTS}/${jobId}?candidateId=${candidateId || ''}`
}
