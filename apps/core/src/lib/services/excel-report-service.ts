import ExcelJS from 'exceljs'
import {
	CandidateStatus as CandidateFilterStatus,
	DataRange,
	InterviewCount,
} from '@/http/constants/candidate-filters'
import {
	CandidateStatus,
	DEFAULT_MESSAGES,
	EXCEL_COLUMNS,
	EXCEL_CONFIG,
	generateCandidateInfoUrl,
	generateInterviewResultUrl,
	JobStatus,
} from '@/http/constants/excel-report-constants'
import type { InfraProvider } from '@coploy/infra'
import type {
	Company,
	ExcelReportFilters,
	ExcelReportData,
	FirestoreTimestamp,
	Interview,
	ProcessedInterview,
} from '@/types/excel-report'

// Helper para normalizar valores de data vindos de fontes diversas:
// - Repositório novo: já entrega `Date` (ou null)
// - Legado Firestore: `{ seconds, nanoseconds }`
// - Serializado: string ISO
function convertFirestoreTimestamp(
	value?: FirestoreTimestamp | Date | string | null,
): Date | null {
	if (value == null) return null

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value
	}

	if (typeof value === 'string') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? null : parsed
	}

	if (typeof value === 'object' && typeof (value as FirestoreTimestamp).seconds === 'number') {
		return new Date((value as FirestoreTimestamp).seconds * 1000)
	}

	return null
}

// Helper para formatar score como número (Excel ordena/filtra corretamente).
// Retorna '' (string vazia) quando ausente — célula vazia em vez de 0.
function formatScore(score?: number): number | '' {
	if (score == null || Number.isNaN(score)) return ''
	const decimals = EXCEL_CONFIG.SCORE_DECIMAL_PLACES
	const factor = 10 ** decimals
	return Math.round(score * factor) / factor
}

function getDateRangeFilter(range?: string): Date {
	const now = new Date()
	switch (range) {
		case DataRange.LAST_WEEK:
			return new Date(now.setDate(now.getDate() - 7))
		case DataRange.LAST_MONTH:
			return new Date(now.setMonth(now.getMonth() - 1))
		case DataRange.LAST_3_MONTHS:
			return new Date(now.setMonth(now.getMonth() - 3))
		default:
			return new Date(0)
	}
}

function getCandidateKey(interview: Interview): string {
	return `${interview.email || ''}-${interview.name || ''}`.toLowerCase()
}

function getCandidateInterviewCounts(interviews: Interview[]): Map<string, number> {
	const counts = new Map<string, number>()
	for (const interview of interviews) {
		const key = getCandidateKey(interview)
		counts.set(key, (counts.get(key) || 0) + 1)
	}
	return counts
}

function matchesInterviewCount(
	interview: Interview,
	filters: ExcelReportFilters,
	counts: Map<string, number>,
): boolean {
	const count = counts.get(getCandidateKey(interview)) || 0
	if (!filters.interviewCount || filters.interviewCount === InterviewCount.ALL) return true
	if (filters.interviewCount === InterviewCount.AT_LEAST_ONE) return count === 1
	if (filters.interviewCount === InterviewCount.MORE_THAN_ONE) return count > 1
	return true
}

function matchesReportFilters(
	interview: Interview,
	filters: ExcelReportFilters,
	counts: Map<string, number>,
): boolean {
	if (filters.status && filters.status !== CandidateFilterStatus.ALL && interview.candidate_status !== filters.status) return false
	if (filters.dataRange && filters.dataRange !== DataRange.ALL) {
		const date = convertFirestoreTimestamp(interview.date)
		if (!date || date < getDateRangeFilter(filters.dataRange)) return false
	}
	if (filters.score !== undefined) {
		const score = Number(interview.score)
		const scoreMin = Math.floor(filters.score)
		if (!Number.isFinite(score) || score < scoreMin || score > scoreMin + 0.99) return false
	}
	if (filters.jobId && interview.job_ref?.id !== filters.jobId && interview.job_applied_ref?.id !== filters.jobId) return false
	if (!matchesInterviewCount(interview, filters, counts)) return false
	if (!filters.find) return true
	const search = filters.find.toLowerCase().trim()
	return interview.name?.toLowerCase().includes(search) || interview.email?.toLowerCase().includes(search)
}

function applyReportFilters(
	interviews: Interview[],
	filters?: ExcelReportFilters,
): Interview[] {
	if (!filters) return interviews
	const counts = getCandidateInterviewCounts(interviews)
	return interviews.filter((interview) => matchesReportFilters(interview, filters, counts))
}

// Determinar status da vaga
function determineJobStatus(interview: any): string {
	return interview?.stopped ? JobStatus.INACTIVE : JobStatus.ACTIVE
}

// Processar data de seleção
function processSelectionDate(interview: Interview): Date | string {
	if (interview.candidate_status === CandidateStatus.PENDING) {
		return DEFAULT_MESSAGES.CANDIDATE_UNDER_ANALYSIS
	}

	if (interview.date_select) {
		return (
			convertFirestoreTimestamp(interview.date_select) ||
			DEFAULT_MESSAGES.DATE_NOT_AVAILABLE
		)
	}

	return DEFAULT_MESSAGES.DATE_NOT_AVAILABLE
}

// Gerar URLs de links
function generateInterviewLinks(interview: Interview): {
	linkDaVaga: string
	linkCandidato: string
} {
	// Extrair user ID de user_ref
	const userId = interview.user_ref?.id || interview.candidate_id || ''

	// Extrair segmentos do job_ref
	const linkDaVaga = generateInterviewResultUrl(interview.job_ref.id)

	// Gerar link do candidato APENAS se a entrevista foi REALMENTE concluída
	// Status "StartInterview" significa que começou mas não terminou
	const isInterviewCompleted =
		interview.candidate_status &&
		interview.candidate_status !== 'StartInterview'

	const linkCandidato = isInterviewCompleted
		? generateCandidateInfoUrl(userId, interview.job_ref.id)
		: ''

	return { linkDaVaga, linkCandidato }
}

// Processar uma única entrevista
export function processInterviewRow(
	interview: Interview,
	_index: number,
): ProcessedInterview {
	const { linkDaVaga, linkCandidato } = generateInterviewLinks(interview)

	const dataRequisicao =
		convertFirestoreTimestamp(interview.date) ||
		DEFAULT_MESSAGES.DATE_NOT_AVAILABLE
	// Fallback chain: finishedTime (preferido) → date_select → date
	// Necessário porque registros legados (pré-fix do sync de companyInterviews)
	// não têm finishedTime propagado da coleção jobsApplied.
	const dataTeste =
		convertFirestoreTimestamp(interview.finishedTime) ||
		convertFirestoreTimestamp(interview.date_select) ||
		convertFirestoreTimestamp(interview.date) ||
		DEFAULT_MESSAGES.DATE_NOT_AVAILABLE
	const dataSelecao = processSelectionDate(interview)

	return {
		codigoVaga: interview.identifier || '',
		dataRequisicao,
		linkDaVaga,
		vaga: interview.job_name || '',
		statusVaga: determineJobStatus(interview),
		tipoVaga: interview.career_level || '',
		nomeCandidato: interview.name || DEFAULT_MESSAGES.UNKNOWN_CANDIDATE,
		nota: formatScore(interview.score),
		dataTeste,
		emailCandidato: interview.email || '',
		telefoneCandidato: interview.phone_number || '',
		status: interview.candidate_status || '',
		dataSelecao,
		linkCandidato,
	}
}

// Processar todas as entrevistas
export function processAllInterviews(interviews: Interview[]): {
	processedInterviews: ProcessedInterview[]
	totalScore: number
	validScoreCount: number
} {
	const processedInterviews: ProcessedInterview[] = []
	let totalScore = 0
	let validScoreCount = 0

	for (let index = 0; index < interviews.length; index++) {
		try {
			const interview = interviews[index]
			const processedInterview = processInterviewRow(interview, index)
			processedInterviews.push(processedInterview)

			// Acumular scores para média
			if (interview.score) {
				totalScore += interview.score
				validScoreCount++
			}
		} catch (error) {
			console.error('Erro ao processar entrevista:', error)
		}
	}

	return { processedInterviews, totalScore, validScoreCount }
}

// Criar workbook Excel
export function createExcelWorkbook(): ExcelJS.Workbook {
	const workbook = new ExcelJS.Workbook()
	const worksheet = workbook.addWorksheet(EXCEL_CONFIG.WORKSHEET_NAME)

	// Configurar colunas
	worksheet.columns = EXCEL_COLUMNS as unknown as Partial<ExcelJS.Column>[]

	// Estilo bold para o cabeçalho
	worksheet.getRow(1).font = { bold: true }

	// Adicionar filtros em todas as colunas
	worksheet.autoFilter = {
		from: {
			row: EXCEL_CONFIG.AUTO_FILTER.ROWS.FROM,
			column: EXCEL_CONFIG.AUTO_FILTER.COLUMNS.FROM,
		},
		to: {
			row: EXCEL_CONFIG.AUTO_FILTER.ROWS.TO,
			column: EXCEL_CONFIG.AUTO_FILTER.COLUMNS.TO,
		},
	}

	return workbook
}

// Adicionar dados ao worksheet
export function addDataToWorksheet(
	worksheet: ExcelJS.Worksheet,
	processedInterviews: ProcessedInterview[],
	totalInterviews: number,
	averageScore: number,
): void {
	// Adicionar dados das entrevistas
	for (const interview of processedInterviews) {
		worksheet.addRow(interview)
	}

	// Adicionar estatísticas
	worksheet.addRow([])
	worksheet.addRow([`Total de entrevistas finalizadas: ${totalInterviews}`])

	if (totalInterviews > 0) {
		worksheet.addRow([
			`Média das notas: ${averageScore.toFixed(EXCEL_CONFIG.SCORE_DECIMAL_PLACES)}`,
		])
	}
}

// Gerar arquivo Excel final
export async function generateExcelFile(
	reportData: ExcelReportData,
): Promise<string> {
	// Criar workbook
	const workbook = createExcelWorkbook()
	const worksheet = workbook.worksheets[0]

	// Adicionar dados
	addDataToWorksheet(
		worksheet,
		reportData.interviews,
		reportData.totalInterviews,
		reportData.averageScore,
	)

	// Gerar buffer e converter para base64
	const excelBuffer = await workbook.xlsx.writeBuffer()
	return Buffer.from(excelBuffer).toString('base64')
}

export function createExcelReportService(infra: InfraProvider) {
	// Closures (não métodos) — sem dependência de `this`, sobrevivem a destructuring.
	async function fetchCompanyData(companyId: string): Promise<Company> {
		const companyDoc = (await infra.companyRepository.getCompany(companyId)) as Company | null

		if (!companyDoc) {
			throw new Error(DEFAULT_MESSAGES.COMPANY_NOT_FOUND)
		}

		return companyDoc
	}

	async function fetchCompanyInterviews(
		companyId: string,
		options?: { year?: number; filters?: ExcelReportFilters },
	): Promise<Interview[]> {
		const filters: Array<{ field: string; operator: string; value: unknown }> = [
			{ field: 'finished', operator: '==', value: true },
		]

		if (options?.year != null) {
			const year = options.year
			filters.push({ field: 'date', operator: '>=', value: new Date(Date.UTC(year, 0, 1)) })
			filters.push({ field: 'date', operator: '<', value: new Date(Date.UTC(year + 1, 0, 1)) })
		}

		const interviewsSnapshot = (await infra.candidateRepository.listCompanyInterviews(
			companyId,
			{ filters: filters as import('@coploy/infra').QueryFilter[] },
		)) as unknown as Interview[]

		if (interviewsSnapshot.length === 0) {
			return []
		}

		return applyReportFilters(interviewsSnapshot, options?.filters)
	}

	async function generateExcelReportData(
		companyId: string,
		options?: { year?: number; filters?: ExcelReportFilters },
	): Promise<ExcelReportData> {
		const [company, interviews] = await Promise.all([
			fetchCompanyData(companyId),
			fetchCompanyInterviews(companyId, options),
		])

		const { processedInterviews, totalScore, validScoreCount } =
			processAllInterviews(interviews)

		const totalInterviews = processedInterviews.length
		const averageScore = validScoreCount > 0 ? totalScore / validScoreCount : 0

		return {
			interviews: processedInterviews,
			totalInterviews,
			averageScore,
			companyName: company.companyName,
		}
	}

	return {
		fetchCompanyData,
		fetchCompanyInterviews,
		generateExcelReportData,
	}
}
