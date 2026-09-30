/**
 * CSV para Excel em pt-BR.
 *
 * Extraído de `features/jobs/export-csv` quando Candidatos e Hunting passaram a
 * exportar também: as três telas precisam do mesmo separador, do mesmo escape e
 * do mesmo BOM, e três cópias divergem no primeiro acento.
 */

/**
 * Escapa uma célula.
 *
 * `;` como separador (não `,`): o Excel em pt-BR usa ponto e vírgula, e com
 * vírgula o arquivo abre com tudo numa coluna só. Aspas internas dobram, que é
 * o escape do formato.
 */
export function cell(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value)
	return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Monta o arquivo com cabeçalho e BOM — sem ele o Excel come os acentos. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
	const lines = [headers.map(cell).join(';'), ...rows.map((row) => row.map(cell).join(';'))]
	return `﻿${lines.join('\r\n')}`
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

/** `candidatos-2026-08-17.csv` — data no nome evita sobrescrever download antigo. */
export function csvFilename(prefix: string): string {
	return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
}
