import { Link } from '@tanstack/react-router'
import { Download, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isTerminalStage } from '@/features/jobs/stages'
import { useCapabilities } from '@/lib/capabilities'

import { empresa } from '@coploy/sdk/react'

import { formatDuration } from '@/features/jobs/map'
import { stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { csvFilename, downloadCsv, toCsv } from '@/lib/csv'
import { Button } from '@/ui/button'

interface Row {
	id: string
	name: string
	email: string | null
	occupation: string | null
	photoUrl: string | null
	score: number | null
	stage: string
	waitingMs: number | null
}

function toRow(dto: Record<string, unknown>): Row {
	const date = dto.date_select ?? dto.date
	const since = date ? new Date(String(date)).getTime() : null
	return {
		id: String(dto.id ?? ''),
		name: (dto.name as string)?.trim() || '—',
		email: (dto.email as string) ?? null,
		occupation: (dto.occupation as string) ?? null,
		photoUrl: (dto.photo_url as string) || null,
		score: dto.score === null || dto.score === undefined ? null : Number(dto.score),
		stage: String(dto.candidateStatus ?? dto.candidate_status ?? 'pending').toLowerCase(),
		/*
		 * O relógio de SLA PARA nas etapas terminais (regra do domínio):
		 * reprovado/aprovado/contratado não está aguardando nada — a coluna
		 * contando pra sempre lia como pendência eterna (relato do teste).
		 */
		waitingMs:
			isTerminalStage(String(dto.stage ?? '')) || !since || Number.isNaN(since)
				? null
				: Math.max(0, Date.now() - since),
	}
}

/**
 * Candidatos da vaga, em lista.
 *
 * O quadro responde "onde cada um está"; a lista responde "quem é o melhor" —
 * ordenada por nota, com o tempo parado ao lado. São perguntas diferentes, e
 * antes só existia a primeira: para comparar candidatos era preciso ler as
 * colunas do kanban de cima a baixo.
 */
export function JobCandidatesList({ jobId }: { jobId: string }) {
	const { t } = useTranslation()
	const [onlyScored, setOnlyScored] = useState(false)

	const { features } = useCapabilities()
	/*
	 * `finished: 'all'` como o board: a aba lista QUEM ESTÁ NO PROCESSO. O
	 * default 'true' da rota protege a v1 — aqui ele deixava a aba vazia na
	 * edição open, onde ninguém jamais finaliza entrevista (relato do teste).
	 */
	const { data, isLoading } = empresa.useGetCompaniesJobsJobIdCandidates(
		jobId,
		{ limit: '200', finished: 'all' },
		{ query: { enabled: Boolean(jobId) } },
	)

	const rows = useMemo(() => {
		const list = ((data?.data as { candidates?: Array<Record<string, unknown>> } | undefined)
			?.candidates ?? []) as Array<Record<string, unknown>>
		return list
			.map(toRow)
			.filter((row) => (onlyScored ? row.score !== null : true))
			// nota primeiro: a lista existe para comparar, não para ver o que chegou
			.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
	}, [data, onlyScored])

	function exportCsv() {
		const headers = [
			t('candidates.candidate'),
			t('candidates.email'),
			t('candidates.stage'),
			t('candidates.score'),
			t('candidates.waiting'),
		]
		downloadCsv(
			toCsv(
				headers,
				rows.map((row) => [
					row.name,
					row.email ?? '',
					stageLabel(row.stage, t),
					row.score ?? '',
					row.waitingMs === null ? '' : Math.floor(row.waitingMs / 86_400_000),
				]),
			),
			csvFilename('candidatos-da-vaga'),
		)
	}

	return (
		<div className='flex flex-col gap-3 p-6'>
			<div className='flex flex-wrap items-center gap-2'>
				{features.motor && (
				<button
					onClick={() => setOnlyScored((current) => !current)}
					aria-pressed={onlyScored}
					className={cn(
						'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
						onlyScored
							? 'border-lime bg-lime-soft font-medium text-lime-fg'
							: 'border-border text-text-2 hover:bg-hover',
					)}
				>
					{t('candidates.onlyScored')}
				</button>
			)}

				<Button
					variant='secondary'
					size='sm'
					className='ml-auto'
					onClick={exportCsv}
					disabled={rows.length === 0}
				>
					<Download size={12} /> {t('export.action')}
				</Button>
			</div>

			<div className='overflow-auto rounded-xl border border-border bg-card'>
				<table className='w-full border-collapse text-[13px]'>
					<thead>
						<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
							<th className='px-4 py-2.5 font-medium'>{t('candidates.candidate')}</th>
							<th className='px-4 py-2.5 font-medium'>{t('candidates.stage')}</th>
							<th className='px-4 py-2.5 text-right font-medium'>{t('candidates.score')}</th>
							<th className='px-4 py-2.5 text-right font-medium'>{t('candidates.waiting')}</th>
						</tr>
					</thead>
					<tbody>
						{isLoading &&
							Array.from({ length: 5 }, (_, index) => (
								<tr key={index} className='border-b border-border-soft last:border-0'>
									<td colSpan={4} className='px-4 py-3'>
										<div className='h-5 animate-pulse rounded bg-card-alt' />
									</td>
								</tr>
							))}

						{!isLoading && rows.length === 0 && (
							<tr>
								<td colSpan={4} className='px-4 py-16 text-center'>
									<Users size={20} className='mx-auto mb-2 text-muted' />
									<p className='text-[13px] font-medium'>{t('pipeline.emptyColumn')}</p>
								</td>
							</tr>
						)}

						{rows.map((row) => (
							<tr key={row.id} className='border-b border-border-soft last:border-0 hover:bg-hover'>
								<td className='px-4 py-2.5'>
									<Link
										to='/vagas/$jobId/candidatos/$candidateId'
										params={{ jobId, candidateId: row.id }}
										className='flex items-center gap-2.5'
									>
										{row.photoUrl ? (
											<img
												src={row.photoUrl}
												alt=''
												width={26}
												height={26}
												loading='lazy'
												className='h-[26px] w-[26px] shrink-0 rounded-full object-cover'
											/>
										) : (
											<span className='flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-card-alt text-[10px] font-semibold text-text-2'>
												{row.name.slice(0, 2).toUpperCase()}
											</span>
										)}
										<span className='min-w-0'>
											<span className='block truncate font-medium'>{row.name}</span>
											{row.occupation && (
												<span className='block truncate text-[11.5px] text-muted'>
													{row.occupation}
												</span>
											)}
										</span>
									</Link>
								</td>
								<td className='px-4 py-2.5 text-text-2'>{stageLabel(row.stage, t)}</td>
								<td className='font-num px-4 py-2.5 text-right'>
									{row.score === null ? (
										<span className='text-muted'>—</span>
									) : (
										row.score.toFixed(1).replace('.', ',')
									)}
								</td>
								<td className='font-num px-4 py-2.5 text-right text-text-2'>
									{row.waitingMs === null ? '—' : formatDuration(row.waitingMs)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}
