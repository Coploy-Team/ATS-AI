import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'
import { Eye, UserCog } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'
import { useCapabilities } from '@/lib/capabilities'
import { Card, Page } from '@/ui/page'

type Colaborador = {
	id: string
	name?: string
	email?: string
	accessLevel?: string
	userRef?: string
}

/**
 * De quem é esta vaga, e quem consegue enxergá-la.
 *
 * O `creatorId` decidia as duas coisas desde a hierarquia de acesso e não
 * aparecia em tela nenhuma: era possível ter uma vaga cujo dono saiu da empresa,
 * invisível para todos os outros recrutadores, sem nada na interface que
 * explicasse o motivo nem permitisse resolver.
 */
export function JobTeamPage() {
	const { t } = useTranslation()
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	const { role } = useCapabilities()
	const [erro, setErro] = useState<string | null>(null)
	const [salvando, setSalvando] = useState(false)

	const { data, refetch } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const job = data?.data as
		| { creatorId?: string | null; creatorName?: string | null; creatorEmail?: string | null }
		| undefined

	const { data: equipe } = empresa.useGetCompaniesCollaborators()
	const colaboradores = ((equipe?.data as { collaborators?: Colaborador[] } | undefined)
		?.collaborators ?? []) as Colaborador[]

	const patch = empresa.usePatchCompaniesJobsJobId()

	/*
	 * Só quem enxerga todas as vagas pode passar uma adiante — a mesma régua que
	 * o servidor aplica. Oferecer o seletor a quem vai levar 400 seria prometer
	 * o que não se cumpre.
	 */
	const podeTrocar = role !== 'recruiter'

	/*
	 * Quem vê esta vaga: todo mundo, menos o recrutador que não é o dono. Não é
	 * uma lista guardada em lugar nenhum — é a regra de alcance aplicada à
	 * equipe atual, então nunca fica desatualizada.
	 */
	const enxergam = colaboradores.filter(
		(p) => p.accessLevel !== 'recruiter' || ehDono(p, job?.creatorId),
	)

	async function trocarDono(creatorId: string) {
		setErro(null)
		setSalvando(true)
		try {
			await patch.mutateAsync({ jobId, data: { creatorId } as never })
			await refetch()
		} catch {
			setErro(t('jobTeam.transferError'))
		} finally {
			setSalvando(false)
		}
	}

	return (
		<Page title={t('jobTeam.title')} subtitle={t('jobTeam.subtitle')}>
			<div className='flex max-w-2xl flex-col gap-4'>
				<Card title={t('jobTeam.ownerTitle')}>
					<div className='flex flex-col gap-3'>
						<div>
							<p className='font-medium leading-tight'>
								{job?.creatorName?.trim() || t('jobTeam.noOwner')}
							</p>
							{job?.creatorEmail && (
								<p className='text-[11.5px] text-muted'>{job.creatorEmail}</p>
							)}
						</div>

						<p className='flex items-start gap-2 text-[12.5px] text-muted'>
							<UserCog size={14} className='mt-px shrink-0' />
							{t('jobTeam.ownerHint')}
						</p>

						{podeTrocar && (
							<div className='flex flex-col gap-1.5'>
								<label className='text-[12px] font-medium'>
									{t('jobTeam.transferLabel')}
								</label>
								<select
									value={job?.creatorId ?? ''}
									disabled={salvando}
									onChange={(e) => e.target.value && void trocarDono(e.target.value)}
									className='h-8 min-w-[220px] rounded-lg border border-border bg-surface px-2 text-[12.5px] text-text'
								>
									<option value=''>{t('jobTeam.transferPlaceholder')}</option>
									{colaboradores.map((p) => (
										<option key={p.id} value={p.userRef || p.id}>
											{p.name || p.email || p.id}
										</option>
									))}
								</select>
							</div>
						)}

						{erro && <p className='text-[12.5px] text-danger'>{erro}</p>}
					</div>
				</Card>

				<Card title={t('jobTeam.visibilityTitle')}>
					<p className='mb-3 flex items-start gap-2 text-[12.5px] text-muted'>
						<Eye size={14} className='mt-px shrink-0' />
						{t('jobTeam.visibilityHint')}
					</p>
					<ul className='flex flex-col gap-1.5'>
						{enxergam.map((p) => (
							<li key={p.id} className='flex items-baseline justify-between gap-3'>
								<span className='text-[13px]'>{p.name || p.email}</span>
								<span className='text-[11.5px] text-muted'>
									{t(`team.levels.${p.accessLevel ?? 'owner'}`, {
										defaultValue: p.accessLevel ?? '',
									})}
								</span>
							</li>
						))}
						{enxergam.length === 0 && (
							<li className='text-[12.5px] text-muted'>{t('jobTeam.nobody')}</li>
						)}
					</ul>
				</Card>
			</div>
		</Page>
	)
}

/** O colaborador aparece com dois ids possíveis conforme a origem do cadastro. */
function ehDono(p: Colaborador, creatorId?: string | null): boolean {
	if (!creatorId) return false
	return p.id === creatorId || p.userRef === creatorId
}
