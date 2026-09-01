import { Check, Mail, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { ReadOnlyNotice } from '@/components/read-only-notice'
import { getAuth } from '@/lib/auth'
import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { Field, Select } from '@/features/job-form/fields'
import { Banner, Card, FormGrid, Page } from '@/ui/page'

import { RolesCard } from './roles-card'

/*
 * Os papéis REAIS do sistema.
 *
 * A tela usava `admin | recruiter | viewer`, nomes que eu inventei e que não
 * existem em lugar nenhum: o core grava `owner | editor | shared`. Como nenhum
 * valor batia, o `<select>` caía na primeira opção e mostrava "Administrador"
 * para TODO MUNDO — inclusive para um convidado de revisão. E trocar o papel
 * mandava um valor que a API não conhece.
 *
 * Desde 28/08 a escada tem quatro degraus de verdade. Vale notar o que estava
 * acontecendo antes: a tela CHAMAVA `editor` de "Recrutador" — o nome estava
 * certo e o comportamento é que não era, porque esse papel enxergava a empresa
 * inteira. Agora `recruiter` existe e alcança só as vagas que a pessoa criou.
 *
 * `editor` continua no tipo por causa de quem já tem: ele aparece na lista de
 * quem o possui, mas não é OFERECIDO — rebaixar em migração encolheria sem
 * aviso o que cada cliente enxerga hoje.
 */
type AccessLevel = 'owner' | 'admin' | 'recruiter' | 'editor' | 'shared'

/** O que a tela oferece ao convidar ou trocar. Sem o legado. */
const LEVELS: AccessLevel[] = ['owner', 'admin', 'recruiter', 'shared']

/**
 * Time da empresa.
 *
 * Convidar colaborador é a única ação de escrita aqui, e ela cria acesso a
 * dado de candidato — por isso o nível vem explícito no formulário em vez de
 * um default silencioso.
 */
export function TeamPage() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const { data, isLoading, isError, refetch, isFetching } = empresa.useGetCompaniesCollaborators()
	const invite = empresa.usePostCompaniesCollaborators()
	const update = empresa.usePutCompaniesCollaboratorsId()
	const remove = empresa.useDeleteCompaniesCollaboratorsId()

	const [inviting, setInviting] = useState(false)
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	// convidar entra como recrutador: o degrau que dá trabalho sem dar alcance
	const [level, setLevel] = useState<AccessLevel>('recruiter')
	const [error, setError] = useState<string | null>(null)
	/** Confirmação inline: remover acesso não merece modal, mas merece 2 passos. */
	const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null)

	const collaborators = data?.data.collaborators ?? []
	/*
	 * A PRÓPRIA LINHA não se mexe.
	 *
	 * Quem abriu a conta agora aparece na lista (antes o time nascia vazio), e
	 * com ela apareceram dois botões que não deveriam existir para si mesmo:
	 * baixar o próprio nível e tirar o próprio acesso — as duas coisas trancam a
	 * pessoa fora da empresa dela. A v1 já tratava isso (`canRemove`).
	 */
	const meuUid = getAuth().getCurrentUser()?.uid ?? null
	const souEu = (person: { id: string; userRef?: unknown }) =>
		!!meuUid && (person.id === meuUid || person.userRef === meuUid)

	async function submitInvite() {
		setError(null)
		try {
			await invite.mutateAsync({
				data: { name: name.trim(), email: email.trim(), accessLevel: level } as never,
			})
			setName('')
			setEmail('')
			setInviting(false)
			await refetch()
		} catch {
			setError(t('team.inviteError'))
		}
	}

	async function changeLevel(id: string, accessLevel: AccessLevel) {
		/*
		 * Sem `.catch` mudo: engolir a falha fazia a pessoa trocar o papel, não ver
		 * nada acontecer e concluir que trocou. O banner de erro já existe na tela.
		 */
		try {
			await update.mutateAsync({ id, data: { accessLevel } as never })
			setError(null)
		} catch {
			setError(t('team.changeFailed'))
		}
		await refetch()
	}

	async function removeCollaborator(id: string) {
		await remove.mutateAsync({ id }).catch(() => undefined)
		setConfirmingRemoval(null)
		await refetch()
	}

	return (
		<Page
			title={t('team.title')}
			subtitle={isLoading ? t('jobs.loading') : t('team.summary', { count: collaborators.length })}
			actions={
				!inviting &&
				// convidar cria acesso à base inteira — é capability de owner
				can('team:write') && (
					<Button onClick={() => setInviting(true)}>
						<Plus size={14} /> {t('team.invite')}
					</Button>
				)
			}
		>
			<ReadOnlyNotice capability='team:write' />

			{inviting && (
				<Card title={t('team.inviteTitle')} className='mb-4'>
					<FormGrid columns={3}>
						<Field label={t('team.name')}>
							<input
								value={name}
								onChange={(e) => setName(e.target.value)}
								className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
							/>
						</Field>
						<Field label={t('team.email')}>
							<input
								type='email'
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
							/>
						</Field>
						<Field label={t('team.level')} hint={t('team.levelHint')}>
							<Select
								value={level}
								onChange={(value) => setLevel(value as AccessLevel)}
								options={LEVELS.map((value) => ({
									value,
									label: t(`team.levels.${value}`),
								}))}
							/>
						</Field>
					</FormGrid>

					<p className='mt-2 text-[11.5px] text-muted'>{t(`team.levelDescription.${level}`)}</p>
					{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

					<div className='mt-4 flex items-center gap-2'>
						<Button
							onClick={() => void submitInvite()}
							disabled={invite.isPending || !name.trim() || !email.includes('@')}
						>
							<Mail size={13} />
							{invite.isPending ? t('team.inviting') : t('team.sendInvite')}
						</Button>
						<Button variant='secondary' onClick={() => setInviting(false)}>
							{t('filters.cancel')}
						</Button>
					</div>
				</Card>
			)}

			{isError && (
				<Banner
					tone='danger'
					className='mb-4'
					actions={
						<Button variant='secondary' size='sm' onClick={() => refetch()}>
							<RefreshCw size={12} /> {t('jobs.retry')}
						</Button>
					}
				>
					{t('team.error')}
				</Banner>
			)}

			{!isError && (
				<div
					className={cn(
						// mesmo defeito da lista de vagas: `overflow-hidden` corta a
						// tabela em vez de deixar rolar (e-mail longo some a coluna)
						'overflow-x-auto rounded-xl border border-border bg-card transition-opacity',
						isFetching && 'opacity-60',
					)}
				>
					<table className='w-full border-collapse text-[13px]'>
						<thead>
							<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
								<th className='px-4 py-2.5 font-medium'>{t('team.person')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('team.level')}</th>
								<th className='px-4 py-2.5 text-right font-medium'>{t('team.actions')}</th>
							</tr>
						</thead>
						<tbody>
							{isLoading &&
								Array.from({ length: 3 }, (_, i) => (
									<tr key={i} className='border-b border-border-soft last:border-0'>
										<td colSpan={3} className='px-4 py-3'>
											<div className='h-5 animate-pulse rounded bg-card-alt' />
										</td>
									</tr>
								))}

							{!isLoading && collaborators.length === 0 && (
								<tr>
									<td colSpan={3} className='px-4 py-12 text-center text-[12px] text-muted'>
										{t('team.empty')}
									</td>
								</tr>
							)}

							{collaborators.map((person) => (
								<tr key={person.id} className='border-b border-border-soft last:border-0'>
									<td className='px-4 py-2.5'>
										<p className='font-medium leading-tight'>
											{person.name}
											{souEu(person) && (
												<span className='ml-1.5 text-[11px] font-normal text-muted'>
													{t('team.you')}
												</span>
											)}
										</p>
										<p className='text-[11.5px] text-muted'>{person.email}</p>
									</td>
									<td className='px-4 py-2.5'>
										{souEu(person) ? (
											<span className='text-[12.5px]'>
												{t(`team.levels.${person.accessLevel}`)}
											</span>
										) : (
											<Select
												value={person.accessLevel}
												onChange={(value) =>
													void changeLevel(person.id, value as AccessLevel)
												}
												options={LEVELS.map((value) => ({
													value,
													label: t(`team.levels.${value}`),
												}))}
											/>
										)}
									</td>
									<td className='px-4 py-2.5 text-right'>
										{souEu(person) ? (
											<span className='text-[11.5px] text-muted'>{t('team.selfHint')}</span>
										) : confirmingRemoval === person.id ? (
											<span className='inline-flex items-center gap-1.5'>
												<span className='text-[11.5px] text-text-2'>{t('team.confirm')}</span>
												<button
													onClick={() => void removeCollaborator(person.id)}
													aria-label={t('team.confirmYes')}
													className='rounded p-1 text-danger transition-colors hover:bg-danger-soft'
												>
													<Check size={14} />
												</button>
												<button
													onClick={() => setConfirmingRemoval(null)}
													aria-label={t('filters.cancel')}
													className='rounded p-1 text-muted transition-colors hover:text-text'
												>
													<X size={14} />
												</button>
											</span>
										) : (
											<button
												onClick={() => setConfirmingRemoval(person.id)}
												aria-label={t('team.remove')}
												className='rounded p-1 text-muted transition-colors hover:text-danger'
											>
												<Trash2 size={14} />
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* respiro entre a lista e a legenda: as duas bordas estavam se tocando */}
			<div className='mt-4'>
				<RolesCard />
			</div>
		</Page>
	)
}
