import { empresa } from '@coploy/sdk'

import { formatDuration, toJobRow, type JobRow } from './map'

/** Escapa campo de CSV (RFC 4180): aspas dobradas e envolve quando precisa. */
function cell(value: string | number): string {
	const s = String(value ?? '')
	return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export type ExportParams = Record<string, string | undefined>

const PAGE_SIZE = 100
/** Teto de segurança: 50 páginas = 5.000 vagas. Evita loop infinito se a API mentir. */
const MAX_PAGES = 50

/**
 * Exporta TODAS as vagas que casam com os filtros atuais — não só a página
 * visível (exportar o que está na tela seria meia-verdade). Pagina no cliente
 * usando o mesmo endpoint da listagem.
 */
export async function fetchAllJobsForExport(params: ExportParams): Promise<JobRow[]> {
	const rows: JobRow[] = []
	const seen = new Set<string>()

	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await empresa.getCompaniesJobs({
			...(params as Parameters<typeof empresa.getCompaniesJobs>[0]),
			limit: String(PAGE_SIZE),
			page: String(page),
		})

		const batch = response.data.jobs.map(toJobRow)
		const fresh = batch.filter((job) => !seen.has(job.id))
		fresh.forEach((job) => seen.add(job.id))
		rows.push(...fresh)

		// Guarda defensiva: se a página não trouxe NADA novo, o backend está
		// ignorando `page` (core legado devolve sempre a 1ª página e `hasMore`
		// eterno). Parar aqui evita o loop de 50 requests — confiar só no
		// `hasMore` da API é confiar demais.
		if (fresh.length === 0 || !response.data.pagination.hasMore) break
	}
	return rows
}

export function jobsToCsv(rows: JobRow[], headers: Record<string, string>): string {
	const head = [
		headers.title,
		headers.meta,
		headers.status,
		headers.priority,
		headers.candidates,
		headers.stages,
		headers.openFor,
		headers.sla,
		headers.creator,
	].join(';')

	const body = rows.map((r) =>
		[
			cell(r.title),
			cell(r.meta),
			cell(headers[`status_${r.status}`] ?? r.status),
			cell(r.priority ? headers.yes : headers.no),
			cell(r.totalCandidates),
			cell(r.stages.map((s) => `${s.key}=${s.count}`).join(' | ')),
			cell(r.openForDays === null ? '' : r.openForDays),
			cell(
				r.sla.ruleHours === null
					? ''
					: r.sla.breachedForMs !== null
						? `${headers.slaBreached}: ${formatDuration(r.sla.breachedForMs)}`
						: `${r.sla.ruleHours}h`,
			),
			cell(r.creator),
		].join(';'),
	)

	// BOM: Excel em pt-BR precisa dele pra ler acento corretamente.
	return `﻿${[head, ...body].join('\r\n')}`
}

export function downloadCsv(content: string, filename: string) {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	URL.revokeObjectURL(url)
}
