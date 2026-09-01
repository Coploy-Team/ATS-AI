import { useQueryClient } from '@tanstack/react-query'
import { Check, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

const RECOMMENDATIONS = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'] as const
type Recommendation = (typeof RECOMMENDATIONS)[number]

interface Criterion {
	id: string
	label: string
	rating: number | null
}

/**
 * Avaliação do recrutador (V2-302).
 *
 * A tela mostrava só o veredito da IA — o humano decide e não tinha onde
 * registrar. Aqui a nota dele entra ao lado da nota do motor, **sem fundir**:
 * quando as duas discordam, é exatamente isso que precisa ficar visível.
 *
 * Critérios saem dos requisitos tipados da vaga quando existem; senão, de um
 * conjunto mínimo que serve a qualquer processo. Escala 1–5 porque 0–10 entre
 * avaliadores humanos vira ruído — a diferença entre 7 e 8 não é reproduzível.
 */
export function ScorecardPanel({
	jobId,
	candidateId,
	aiScore,
	jobSkills,
}: {
	jobId: string
	candidateId: string
	/** Nota do motor, 0–10 — exibida ao lado, nunca somada. */
	aiScore: number | null
	/** `mainSkills` da vaga, quando houver. */
	jobSkills?: string | null
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	const { data } = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdScorecards(
		jobId,
		candidateId,
	)
	const save = empresa.usePutCompaniesJobsJobIdCandidatesCandidateIdScorecards()

	const payload = data?.data as
		| {
				scorecards?: Array<{
					id: string
					authorName?: string | null
					criteria: Criterion[]
					recommendation: Recommendation
					comment?: string | null
				}>
				summary?: { count: number; average: number | null; consensus: string | null }
		  }
		| undefined

	const existing = payload?.scorecards ?? []
	const summary = payload?.summary

	const defaults: Criterion[] = (jobSkills ?? '')
		.split(',')
		.map((skill) => skill.trim())
		.filter(Boolean)
		.slice(0, 5)
		.map((skill) => ({ id: skill.toLowerCase(), label: skill, rating: null }))

	const fallback: Criterion[] = [
		{ id: 'technical', label: t('scorecard.criteria.technical'), rating: null },
		{ id: 'communication', label: t('scorecard.criteria.communication'), rating: null },
		{ id: 'fit', label: t('scorecard.criteria.fit'), rating: null },
	]

	const [criteria, setCriteria] = useState<Criterion[]>(
		defaults.length > 0 ? defaults : fallback,
	)
	const [recommendation, setRecommendation] = useState<Recommendation>('neutral')
	const [comment, setComment] = useState('')
	const [saved, setSaved] = useState(false)
	const [hydrated, setHydrated] = useState(false)

	// carrega a MINHA avaliação anterior para editar em vez de recomeçar
	useEffect(() => {
		if (hydrated || existing.length === 0) return
		const mine = existing[0]
		if (mine.criteria.length > 0) setCriteria(mine.criteria)
		setRecommendation(mine.recommendation)
		setComment(mine.comment ?? '')
		setHydrated(true)
	}, [existing, hydrated])

	async function submit() {
		setSaved(false)
		await save.mutateAsync({
			jobId,
			candidateId,
			data: { criteria, recommendation, comment: comment.trim() || null },
		})
		setSaved(true)
		await queryClient.invalidateQueries()
	}

	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='flex flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2.5'>
				<UserCheck size={14} className='shrink-0 text-text-2' />
				<h2 className='flex-1 text-[13px] font-medium'>{t('scorecard.title')}</h2>

				{/*
				 * As duas notas lado a lado, com rótulo. Fundir daria um número só e
				 * esconderia a discordância — que é o sinal mais útil da tela.
				 */}
				<span className='flex items-center gap-3 text-[11.5px]'>
					{aiScore !== null && (
						<span className='text-muted'>
							{t('scorecard.ai')}{' '}
							<span className='font-num font-medium text-text'>
								{aiScore.toFixed(1).replace('.', ',')}
							</span>
						</span>
					)}
					{summary?.average != null && (
						<span className='text-muted'>
							{t('scorecard.human')}{' '}
							<span className='font-num font-medium text-text'>
								{summary.average.toFixed(1).replace('.', ',')}
							</span>
							<span className='text-muted'>/5</span>
						</span>
					)}
				</span>
			</header>

			<div className='flex flex-col gap-3 p-4'>
				{criteria.map((criterion, index) => (
					<div key={criterion.id} className='flex flex-wrap items-center gap-2'>
						<span className='w-[170px] shrink-0 truncate text-[12.5px] text-text-2'>
							{criterion.label}
						</span>
						<div className='flex gap-1'>
							{[1, 2, 3, 4, 5].map((value) => (
								<button
									key={value}
									onClick={() =>
										setCriteria((current) =>
											current.map((item, i) =>
												i === index
													? { ...item, rating: item.rating === value ? null : value }
													: item,
											),
										)
									}
									aria-pressed={criterion.rating === value}
									className={cn(
										'font-num h-7 w-7 rounded-md border text-[12px] transition-colors',
										criterion.rating === value
											? 'border-lime bg-lime text-lime-ink'
											: 'border-border text-text-2 hover:bg-hover',
									)}
								>
									{value}
								</button>
							))}
						</div>
					</div>
				))}

				<div className='flex flex-wrap items-center gap-1.5 border-t border-border-soft pt-3'>
					{RECOMMENDATIONS.map((value) => (
						<button
							key={value}
							onClick={() => setRecommendation(value)}
							aria-pressed={recommendation === value}
							className={cn(
								'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
								recommendation === value
									? 'border-lime bg-lime-soft font-medium text-lime-fg'
									: 'border-border text-text-2 hover:bg-hover',
							)}
						>
							{t(`scorecard.recommendation.${value}`)}
						</button>
					))}
				</div>

				<textarea
					value={comment}
					onChange={(event) => setComment(event.target.value)}
					rows={2}
					maxLength={2000}
					placeholder={t('scorecard.commentPlaceholder')}
					className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] text-text'
				/>

				<div className='flex flex-wrap items-center gap-2'>
					<Button onClick={() => void submit()} disabled={save.isPending}>
						{save.isPending ? t('jobConfig.saving') : t('scorecard.save')}
					</Button>
					{saved && (
						<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
							<Check size={13} /> {t('jobConfig.saved')}
						</span>
					)}
					{summary && summary.count > 1 && (
						<span className='text-[11.5px] text-muted'>
							{t('scorecard.others', { count: summary.count - 1 })}
						</span>
					)}
				</div>
			</div>
		</section>
	)
}
