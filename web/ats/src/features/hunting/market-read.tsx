import { AlertTriangle, Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/**
 * Leitura de mercado do talento.
 *
 * O espelho `public_interviews` carrega `interview_tags`: senioridade aferida,
 * red flags, fit por papel e soft skills com evidência — a análise mais densa
 * que a plataforma produz. A tela ignorava tudo isso e dependia de
 * `jobsApplied`, que no hunting pode nem existir (candidato de outra empresa,
 * doc legado apagado) — daí "0 perguntas" num talento com três entrevistas.
 *
 * Aqui o espelho é fonte de primeira classe, não fallback.
 */
export interface InterviewTags {
	senioridade?: {
		nivel_identificado?: string
		confianca_avaliacao?: number
		justificativa?: string
		fatores_principals?: string[]
	}
	resumo_executivo?: {
		pontos_fortes?: string[]
		pontos_desenvolvimento?: string[]
		recomendacao_final?: string
		score_geral?: number
	}
	soft_skills?: Array<{
		categoria?: string
		tag?: string
		pontuacao?: number
		evidencia?: string
	}>
	hard_skills?: Array<{
		categoria?: string
		tag?: string
		pontuacao?: number
		evidencia?: string
	}>
	market_fit?: {
		papeis_potenciais?: Array<{
			papel?: string
			fit?: number
			justificativa?: string
		}>
	}
	gaps?: {
		tecnicos?: Array<{
			area?: string
			descricao?: string
			criticidade?: string
		}>
		red_flags?: Array<{
			tipo?: string
			descricao?: string
			severidade?: string
		}>
	}
}

/**
 * Severidade vira RÉGUA e SELO, não bloco chapado.
 *
 * A primeira versão pintava o retângulo inteiro e o texto de vermelho. Numa
 * leitura com três ou quatro pontos de atenção a tela virava um muro vermelho,
 * fora do vocabulário do resto do ATS — que usa cartão neutro com um traço de
 * cor na borda. Além de feio, apagava a hierarquia: com tudo gritando, nada
 * grita. Agora a cor fica onde ela informa (o traço e o selo) e o texto volta a
 * ser texto.
 */
function severityTone(severity?: string): {
	rule: string
	chip: string
	labelKey: string
} {
	const value = (severity ?? '').toLowerCase()
	if (value.startsWith('crit')) {
		return {
			rule: 'border-l-danger',
			chip: 'bg-danger-soft text-danger',
			labelKey: 'hunting.severityCritical',
		}
	}
	if (value.startsWith('alt')) {
		return {
			rule: 'border-l-amber',
			chip: 'bg-amber-soft text-amber',
			labelKey: 'hunting.severityHigh',
		}
	}
	return { rule: 'border-l-border', chip: 'bg-card-alt text-text-2', labelKey: 'hunting.severityNormal' }
}

export function MarketRead({ tags }: { tags: InterviewTags }) {
	const { t } = useTranslation()

	const seniority = tags.senioridade
	const summary = tags.resumo_executivo
	const roles = (tags.market_fit?.papeis_potenciais ?? []).filter((role) => role.papel)
	const skills = [...(tags.hard_skills ?? []), ...(tags.soft_skills ?? [])].filter((s) => s.tag)
	const redFlags = tags.gaps?.red_flags ?? []
	const technical = tags.gaps?.tecnicos ?? []

	const hasContent =
		Boolean(seniority?.nivel_identificado) ||
		Boolean(summary?.recomendacao_final) ||
		roles.length > 0 ||
		skills.length > 0 ||
		redFlags.length > 0

	if (!hasContent) return null

	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
				<Target size={13} className='text-lime-fg' />
				<h2 className='flex-1 text-[13px] font-medium'>{t('hunting.marketRead')}</h2>
				{seniority?.nivel_identificado && (
					<span className='rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2'>
						{t('hunting.seniorityLevel', {
							level: seniority.nivel_identificado,
						})}
					</span>
				)}
			</header>

			<div className='flex flex-col gap-4 p-4'>
				{seniority?.justificativa && (
					<p className='text-[12.5px] leading-relaxed text-text-2'>{seniority.justificativa}</p>
				)}

				{summary?.recomendacao_final && (
					<p className='rounded-lg border border-border-soft bg-card-alt px-3 py-2 text-[12.5px] leading-relaxed'>
						<span className='font-medium'>{t('hunting.finalRecommendation')}: </span>
						{summary.recomendacao_final}
					</p>
				)}

				{roles.length > 0 && (
					<div>
						<p className='mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted'>
							{t('hunting.roleFit')}
						</p>
						<div className='flex flex-col gap-1.5'>
							{roles.map((role) => {
								// `fit` chega 0–10; a barra fala em porcentagem
								const fit = Math.max(0, Math.min(10, Number(role.fit ?? 0)))
								return (
									<div key={role.papel} className='flex items-center gap-3'>
										<span className='w-[160px] shrink-0 truncate text-[12px] text-text-2'>
											{role.papel}
										</span>
										<span className='h-2 flex-1 rounded-full bg-data-track'>
											<span
												className={cn(
													'block h-2 rounded-full',
													fit >= 7 ? 'bg-lime' : fit >= 4 ? 'bg-data-yellow' : 'bg-data-pink',
												)}
												style={{ width: `${fit * 10}%` }}
											/>
										</span>
										<span className='font-num w-8 shrink-0 text-right text-[11.5px] text-muted'>
											{fit.toFixed(0)}
										</span>
									</div>
								)
							})}
						</div>
					</div>
				)}

				{skills.length > 0 && (
					<div>
						<p className='mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted'>
							{t('hunting.observedSkills')}
						</p>
						<div className='flex flex-wrap gap-1.5'>
							{skills.map((skill, index) => (
								<span
									key={`${skill.tag}-${index}`}
									title={skill.evidencia}
									className='inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-text-2'
								>
									{skill.tag}
									{skill.pontuacao !== undefined && (
										<span className='font-num text-[10.5px] text-muted'>
											{Number(skill.pontuacao).toFixed(0)}
										</span>
									)}
								</span>
							))}
						</div>
					</div>
				)}

				{(redFlags.length > 0 || technical.length > 0) && (
					<div>
						<p className='mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted'>
							<AlertTriangle size={11} /> {t('hunting.attentionPoints')}
						</p>
						<div className='flex flex-col gap-1.5'>
							{[
								...redFlags.map((flag) => ({
									title: flag.tipo,
									description: flag.descricao,
									severity: flag.severidade,
								})),
								...technical.map((gap) => ({
									title: gap.area,
									description: gap.descricao,
									severity: gap.criticidade,
								})),
							].map((item, index) => {
								const tone = severityTone(item.severity)
								return (
									<div
										key={`${item.title}-${index}`}
										className={cn(
											'rounded-lg border border-border border-l-[3px] bg-card px-2.5 py-2 text-[12px] text-text-2',
											tone.rule,
										)}
									>
										<span className='mb-0.5 flex flex-wrap items-center gap-1.5'>
											{item.title && (
												<span className='font-medium text-text'>{item.title}</span>
											)}
											<span
												className={cn(
													'rounded-full px-1.5 py-px text-[10px] font-medium',
													tone.chip,
												)}
											>
												{t(tone.labelKey)}
											</span>
										</span>
										<span className='block leading-snug'>{item.description}</span>
									</div>
								)
							})}
						</div>
					</div>
				)}
			</div>
		</section>
	)
}
