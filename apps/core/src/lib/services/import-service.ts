import type { PostJob } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * Importação por CSV (V2-605, GAP 9).
 *
 * É a porta de saída do ATS anterior. Duas decisões moldam tudo aqui:
 *
 * 1. **Preview antes de gravar.** Migração é a primeira coisa que o cliente faz
 *    no produto; um import que grava 400 linhas erradas de primeira não tem
 *    segunda chance. O preview roda a validação inteira e não escreve nada.
 * 2. **Idempotência por chave externa.** O cliente vai rodar de novo — porque
 *    corrigiu duas linhas, porque a conexão caiu no meio. `externalId` faz a
 *    segunda execução atualizar em vez de duplicar.
 *
 * Erro é reportado **por linha**, com o número da linha do arquivo: "falhou" sem
 * dizer onde obriga a pessoa a conferir 400 linhas na mão.
 */

export type ImportKind = 'jobs' | 'candidates'

export type ImportRowError = {
	/** Linha do ARQUIVO (1 = cabeçalho), não índice do array. */
	line: number
	field: string | null
	message: string
}

export type ImportPreview = {
	kind: ImportKind
	totalRows: number
	valid: number
	invalid: number
	/** Linhas que já existem e serão ATUALIZADAS (casaram por externalId). */
	updates: number
	creates: number
	errors: ImportRowError[]
	/** Amostra do que será gravado — o cliente confere antes de confirmar. */
	sample: Array<Record<string, string>>
}

export type ImportResult = {
	kind: ImportKind
	created: number
	updated: number
	failed: number
	errors: ImportRowError[]
}

/**
 * Parser mínimo de CSV com suporte a aspas e quebra de linha dentro do campo.
 *
 * Sem dependência nova: exportação de ATS é CSV simples, e uma lib completa
 * traria um grafo de dependências para resolver um caso que cabe em 40 linhas.
 * O que ela precisa acertar — e acerta — é aspas duplas escapadas (`""`) e
 * vírgula dentro de campo entre aspas, que é onde parser ingênuo quebra.
 */
export function parseCsv(content: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let inQuotes = false

	// BOM do Excel: sobrevive ao download e corrompe silenciosamente a 1ª coluna
	const text = content.replace(/^﻿/, '')

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]

		if (inQuotes) {
			if (char === '"') {
				if (text[index + 1] === '"') {
					field += '"'
					index += 1
				} else {
					inQuotes = false
				}
			} else {
				field += char
			}
			continue
		}

		if (char === '"') {
			inQuotes = true
		} else if (char === ',' || char === ';') {
			row.push(field)
			field = ''
		} else if (char === '\n') {
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else if (char !== '\r') {
			field += char
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field)
		rows.push(row)
	}

	return rows.filter((line) => line.some((cell) => cell.trim() !== ''))
}

/**
 * Cabeçalho normalizado: `Job Name`, `job_name` e `jobName` viram a mesma
 * coluna — e `Nível` casa com `nivel`. Sem tirar o acento, todo CSV exportado
 * em português perde as colunas silenciosamente: o valor não vira erro, some.
 */
function normalizeHeader(header: string): string {
	return header
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\s_-]+/g, '')
}

const JOB_COLUMNS: Record<string, string> = {
	externalid: 'externalId',
	identifier: 'externalId',
	jobname: 'jobName',
	title: 'jobName',
	vaga: 'jobName',
	jobdescription: 'jobDescription',
	description: 'jobDescription',
	descricao: 'jobDescription',
	carrerlevel: 'carrerLevel',
	careerlevel: 'carrerLevel',
	level: 'carrerLevel',
	nivel: 'carrerLevel',
	city: 'city',
	cidade: 'city',
	state: 'state',
	estado: 'state',
	country: 'country',
	pais: 'country',
	workmodality: 'workModality',
	modalidade: 'workModality',
	contracttype: 'contractType',
	mainskills: 'mainSkills',
	skills: 'mainSkills',
}

const CANDIDATE_COLUMNS: Record<string, string> = {
	externalid: 'externalId',
	name: 'name',
	nome: 'name',
	email: 'email',
	phone: 'phone',
	telefone: 'phone',
	celular: 'phone',
	occupation: 'occupation',
	cargo: 'occupation',
	linkedin: 'linkedinUrl',
	linkedinurl: 'linkedinUrl',
	resume: 'resumeUrl',
	curriculo: 'resumeUrl',
	jobexternalid: 'jobExternalId',
	vaga: 'jobExternalId',
}

function mapRows(rows: string[][], columns: Record<string, string>) {
	const [header, ...body] = rows
	const keys = (header ?? []).map((cell) => columns[normalizeHeader(cell)] ?? null)

	return body.map((cells, index) => {
		const record: Record<string, string> = {}
		keys.forEach((key, position) => {
			if (!key) return
			const value = (cells[position] ?? '').trim()
			if (value) record[key] = value
		})
		// +2: uma linha para o cabeçalho, uma porque arquivo começa em 1
		return { line: index + 2, record }
	})
}

function validate(
	kind: ImportKind,
	entries: Array<{ line: number; record: Record<string, string> }>,
): ImportRowError[] {
	const errors: ImportRowError[] = []
	const seen = new Set<string>()

	for (const { line, record } of entries) {
		if (kind === 'jobs') {
			if (!record.jobName) {
				errors.push({ line, field: 'jobName', message: 'Nome da vaga é obrigatório' })
			}
		} else {
			if (!record.name) {
				errors.push({ line, field: 'name', message: 'Nome do candidato é obrigatório' })
			}
			if (!record.email && !record.phone) {
				errors.push({
					line,
					field: 'email',
					message: 'Informe e-mail ou telefone — sem contato o candidato não é alcançável',
				})
			}
			if (record.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) {
				errors.push({ line, field: 'email', message: 'E-mail inválido' })
			}
		}

		const key = record.externalId
		if (key) {
			if (seen.has(key)) {
				errors.push({
					line,
					field: 'externalId',
					message: `externalId duplicado no arquivo: ${key}`,
				})
			}
			seen.add(key)
		}
	}

	return errors
}

export function createImportService(infra: InfraProvider) {
	async function existingByExternalId(companyId: string): Promise<Map<string, string>> {
		const jobs = (await infra.jobRepository.listJobs(companyId, {}).catch(() => [])) as PostJob[]
		const index = new Map<string, string>()
		for (const job of jobs) {
			const key = (job as { identifier?: string | null }).identifier
			if (key) index.set(String(key), job.id)
		}
		return index
	}

	return {
		parseCsv,

		/** Valida tudo e não grava nada. */
		async preview(params: {
			companyId: string
			kind: ImportKind
			content: string
		}): Promise<ImportPreview> {
			const { companyId, kind, content } = params
			const rows = parseCsv(content)
			const entries = mapRows(rows, kind === 'jobs' ? JOB_COLUMNS : CANDIDATE_COLUMNS)
			const errors = validate(kind, entries)
			const invalidLines = new Set(errors.map((error) => error.line))

			const existing = kind === 'jobs' ? await existingByExternalId(companyId) : new Map()
			let updates = 0
			for (const { line, record } of entries) {
				if (invalidLines.has(line)) continue
				if (record.externalId && existing.has(record.externalId)) updates += 1
			}

			const valid = entries.length - invalidLines.size
			return {
				kind,
				totalRows: entries.length,
				valid,
				invalid: invalidLines.size,
				updates,
				creates: valid - updates,
				errors: errors.slice(0, 200),
				sample: entries
					.filter((entry) => !invalidLines.has(entry.line))
					.slice(0, 5)
					.map((entry) => entry.record),
			}
		},

		/**
		 * Grava. Só linha válida entra; linha com erro é reportada e **não**
		 * interrompe as outras — import que aborta na linha 12 de 400 obriga a
		 * pessoa a repetir o trabalho inteiro.
		 */
		async commit(params: {
			companyId: string
			kind: ImportKind
			content: string
		}): Promise<ImportResult> {
			const { companyId, kind, content } = params
			const rows = parseCsv(content)
			const entries = mapRows(rows, kind === 'jobs' ? JOB_COLUMNS : CANDIDATE_COLUMNS)
			const errors = validate(kind, entries)
			const invalidLines = new Set(errors.map((error) => error.line))

			const result: ImportResult = { kind, created: 0, updated: 0, failed: invalidLines.size, errors }

			if (kind !== 'jobs') {
				/*
				 * Candidato importado ainda não tem caminho de gravação seguro: entra
				 * pelo `pessoa-identity-service` (dedup por CPF) e criar identidade em
				 * lote sem revisão humana é como se cria base duplicada. Preview já
				 * funciona — o commit fica para quando o merge assistido (V2-703)
				 * estiver de pé.
				 */
				return {
					...result,
					failed: entries.length,
					errors: [
						{
							line: 1,
							field: null,
							message:
								'Importação de candidatos está em preview: valide o arquivo e fale com o suporte para concluir a migração.',
						},
					],
				}
			}

			const existing = await existingByExternalId(companyId)

			for (const { line, record } of entries) {
				if (invalidLines.has(line)) continue

				const payload: Record<string, unknown> = {
					/*
					 * Defaults que a listagem exige (achado abrindo a tela).
					 *
					 * `buildJobFilters` sempre aplica `archived == false`, e no
					 * Firestore essa query **não devolve documento onde o campo não
					 * existe**. Sem `archived: false` explícito, a vaga era gravada e
					 * sumia de todos os filtros da tela de Vagas — o cliente migraria
					 * 400 vagas e concluiria que o import falhou.
					 *
					 * `timeCreated` pelo mesmo motivo de ordem prática: é a base de
					 * "dias em aberto" e da ordenação por data.
					 */
					archived: false,
					timeCreated: new Date(),
					usersApplied: [],
					jobName: record.jobName,
					jobDescription: record.jobDescription ?? '',
					carrerLevel: record.carrerLevel ?? '',
					workModality: record.workModality ?? '',
					contractType: record.contractType ?? '',
					mainSkills: record.mainSkills ?? '',
					identifier: record.externalId ?? '',
					address: {
						city: record.city ?? '',
						state: record.state ?? '',
						country: record.country ?? '',
					},
					// importada nasce FECHADA: publicar é decisão, não efeito colateral
					public: false,
					stopped: true,
					source: 'import',
				}

				try {
					const existingId = record.externalId ? existing.get(record.externalId) : undefined
					if (existingId) {
						await infra.jobRepository.updateJob(companyId, existingId, payload as never)
						result.updated += 1
					} else {
						await infra.jobRepository.createJob(companyId, payload as never)
						result.created += 1
					}
				} catch (error) {
					result.failed += 1
					result.errors.push({
						line,
						field: null,
						message: error instanceof Error ? error.message : 'Falha ao gravar',
					})
				}
			}

			return result
		},
	}
}

export type ImportService = ReturnType<typeof createImportService>
