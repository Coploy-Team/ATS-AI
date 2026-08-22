import { AlertCircle, Check, FileUp, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

interface Preview {
	totalRows: number
	valid: number
	invalid: number
	updates: number
	creates: number
	errors: Array<{ line: number; field: string | null; message: string }>
	sample: Array<Record<string, string>>
}

/**
 * Migração por CSV (V2-605).
 *
 * O botão de gravar **só existe depois do preview**, e some quando o arquivo
 * muda. Migração é a primeira coisa que o cliente faz aqui: um import que grava
 * 400 linhas erradas de primeira não tem segunda chance.
 */
export function ImportSection() {
	const { t } = useTranslation()
	const preview = empresa.usePostSettingsImportPreview()
	const commit = empresa.usePostSettingsImportCommit()

	const [kind, setKind] = useState<'jobs' | 'candidates'>('jobs')
	const [content, setContent] = useState('')
	const [fileName, setFileName] = useState<string | null>(null)
	const [report, setReport] = useState<Preview | null>(null)
	const [done, setDone] = useState<{ created: number; updated: number; failed: number } | null>(null)

	async function readFile(file: File) {
		const text = await file.text()
		setContent(text)
		setFileName(file.name)
		// arquivo novo invalida o preview: gravar com o relatório do anterior
		// seria confirmar uma coisa e executar outra
		setReport(null)
		setDone(null)
	}

	async function runPreview() {
		setDone(null)
		const response = await preview.mutateAsync({ data: { kind, content } })
		setReport(response.data as unknown as Preview)
	}

	async function runCommit() {
		const response = await commit.mutateAsync({ data: { kind, content } })
		const result = response.data as unknown as { created: number; updated: number; failed: number }
		setDone(result)
		setReport(null)
	}

	return (
		<Card title={t('import.title')} description={t('import.description')}>
			<div className='flex flex-wrap items-center gap-2'>
				{(['jobs', 'candidates'] as const).map((value) => (
					<button
						key={value}
						onClick={() => {
							setKind(value)
							setReport(null)
							setDone(null)
						}}
						aria-pressed={kind === value}
						className={cn(
							'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
							kind === value
								? 'border-lime bg-lime-soft font-medium text-lime-fg'
								: 'border-border text-text-2 hover:bg-hover',
						)}
					>
						{t(`import.kind.${value}`)}
					</button>
				))}

				<label className='ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-hover'>
					<FileUp size={13} />
					{fileName ?? t('import.chooseFile')}
					<input
						type='file'
						accept='.csv,text/csv'
						className='hidden'
						onChange={(event) => {
							const file = event.target.files?.[0]
							if (file) void readFile(file)
						}}
					/>
				</label>
			</div>

			<div className='mt-3 flex flex-wrap items-center gap-2'>
				<Button onClick={() => void runPreview()} disabled={!content || preview.isPending}>
					{preview.isPending ? t('import.validating') : t('import.validate')}
				</Button>

				{/* gravar só aparece com preview na mão */}
				{report && report.valid > 0 && (
					<Button variant='secondary' onClick={() => void runCommit()} disabled={commit.isPending}>
						<Upload size={13} />
						{t('import.commit', { count: report.valid })}
					</Button>
				)}
			</div>

			{report && (
				<div className='mt-3 rounded-lg border border-border bg-surface p-3'>
					<p className='text-[12.5px]'>
						{t('import.summary', {
							// `count` é o que o i18next flexiona; os outros dois seguem como rótulo
							count: report.totalRows,
							creates: report.creates,
							updates: report.updates,
						})}
					</p>

					{report.invalid > 0 && (
						<>
							<p className='mt-2 inline-flex items-center gap-1.5 text-[12px] text-danger'>
								<AlertCircle size={13} /> {t('import.invalid', { count: report.invalid })}
							</p>
							<ul className='mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto'>
								{report.errors.map((error, index) => (
									<li key={`${error.line}-${index}`} className='text-[11.5px] text-text-2'>
										<span className='font-num text-muted'>
											{t('import.line', { line: error.line })}
										</span>{' '}
										{error.message}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}

			{done && (
				<p className='mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-lime-fg'>
					<Check size={13} />
					{t('import.done', { created: done.created, updated: done.updated, failed: done.failed })}
				</p>
			)}

			<p className='mt-3 border-t border-border-soft pt-2.5 text-[11.5px] text-muted'>
				{t('import.hint')}
			</p>
		</Card>
	)
}
