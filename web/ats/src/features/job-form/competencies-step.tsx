import { Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'

import { Field } from './fields'

/**
 * Competências avaliadas na entrevista.
 *
 * Estavam de fora do wizard, e a consequência não era cosmética: a entrevista
 * pontua o candidato **por competência**, então vaga criada aqui nascia sem os
 * critérios que a avaliação usa — o relatório saía com o bloco de competências
 * vazio enquanto a v1 preenchia.
 *
 * Usa `/ia/skill-description`, a **mesma** rota da v1. Nada de gerador novo: o
 * formato de `competencias_criticas` já é consumido pelo motor de avaliação e
 * por telas antigas; trocá-lo exigiria versionar a rota, e não há razão para
 * isso quando a existente entrega o que se precisa.
 *
 * Texto livre, uma por linha — é como o campo é gravado e como a v1 o edita.
 * Estruturar agora quebraria a leitura do legado.
 */
export function CompetenciesStep({
	draft,
	onChange,
}: {
	draft: {
		jobName: string
		carrerLevel: string
		jobDescription: string
		jobResponsabilities: string
		jobRequirements: string
		language: string
		competencias_criticas: string
		competencias_adicionais: string
		expectativas: string
	}
	onChange: (patch: Partial<Record<string, string>>) => void
}) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const generate = empresa.usePostIaSkillDescription()
	const [failed, setFailed] = useState(false)
	/** Gera uma vez por entrada no passo; regerar é ação explícita. */
	const tried = useRef(false)

	async function run() {
		setFailed(false)
		try {
			const response = await generate.mutateAsync({
				data: {
					cargo: draft.jobName,
					nivel: draft.carrerLevel,
					descricao: draft.jobDescription,
					responsabilidades: draft.jobResponsabilities,
					requisitos: draft.jobRequirements,
					idioma: draft.language,
				},
			})
			const body = response.data as {
				competencias_criticas?: string | null
				competencias_adicionais?: string | null
				expectativa?: string | null
			}
			onChange({
				competencias_criticas: body.competencias_criticas ?? '',
				competencias_adicionais: body.competencias_adicionais ?? '',
				expectativas: body.expectativa ?? '',
			})
		} catch {
			setFailed(true)
		}
	}

	/*
	 * Gera sozinho ao chegar no passo, mas só se ainda não há nada escrito —
	 * sobrescrever o que a pessoa digitou seria pior que não gerar.
	 */
	useEffect(() => {
		// sem o Motor a geração falharia sozinha ao abrir o passo — não dispara
		if (!features.motor) return
		if (tried.current || draft.competencias_criticas || !draft.jobName) return
		tried.current = true
		void run()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [draft.jobName])

	return (
		<div className='flex flex-col gap-4'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-[12.5px] text-text-2'>{t('jobForm.competenciesHint')}</p>
				{features.motor && (
					<Button variant='secondary' size='sm' onClick={() => void run()} disabled={generate.isPending}>
						{generate.isPending ? (
							<Loader2 size={12} className='animate-spin' />
						) : (
							<Sparkles size={12} />
						)}
						{generate.isPending ? t('jobForm.generating') : t('jobForm.generateCompetencies')}
					</Button>
				)}
			</div>

			{failed && <p className='text-[12px] text-danger'>{t('jobForm.generateError')}</p>}

			<Field label={t('jobForm.criticalCompetencies')} hint={t('jobForm.onePerLine')}>
				<textarea
					value={draft.competencias_criticas}
					onChange={(event) => onChange({ competencias_criticas: event.target.value })}
					rows={5}
					className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-text'
				/>
			</Field>

			<Field label={t('jobForm.additionalCompetencies')} hint={t('jobForm.onePerLine')}>
				<textarea
					value={draft.competencias_adicionais}
					onChange={(event) => onChange({ competencias_adicionais: event.target.value })}
					rows={4}
					className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-text'
				/>
			</Field>

			<Field label={t('jobForm.expectations')} hint={t('jobForm.expectationsHint')}>
				<textarea
					value={draft.expectativas}
					onChange={(event) => onChange({ expectativas: event.target.value })}
					rows={3}
					className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-text'
				/>
			</Field>
		</div>
	)
}
