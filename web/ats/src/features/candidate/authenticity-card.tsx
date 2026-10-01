import { AlertTriangle, ChevronDown, Loader2, ShieldCheck, ShieldQuestion, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useQueryClient } from '@tanstack/react-query'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { ConfirmDialog } from '@/ui/confirm-dialog'
import { Card } from '@/ui/page'

export interface Authenticity {
	score: number | null
	humanPercent?: number | null
	level: string | null
	summary: string | null
	criticalFactors?: string[]
	indicators?: Array<{ label: string; detail: string | null; weight: number | null }>
	signals: Array<{ label: string; detail: string | null; severity: string | null }>
	patterns?: string[]
	contextNotes?: string[]
}

/**
 * Análise de autenticidade.
 *
 * É o que sustenta a entrevista assíncrona: sem ela, a nota vale o quanto se
 * confia que a pessoa respondeu sozinha — e essa confiança é justamente o que
 * o formato remoto coloca em dúvida.
 *
 * O motor produz muito mais do que um número: parecer, fatores críticos,
 * sinais suspeitos com severidade, indicadores de autenticidade com peso,
 * padrões repetidos e as próprias ressalvas dele. A versão anterior lia chaves
 * que não existiam no documento e por isso mostrava "sem evidência" em toda
 * entrevista — acusando sem apresentar a prova que estava lá o tempo todo.
 *
 * Recolhido mostra o essencial (percentual + parecer). Expandido mostra a
 * evidência, que é o que permite discordar do veredito.
 */
export function AuthenticityCard({
	data,
	userId,
	jobAppliedId,
}: {
	data: Authenticity | null
	/** Sem o par (candidato, vaga) não dá para pedir a análise — vira só leitura. */
	userId?: string | null
	jobAppliedId?: string | null
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	/*
	 * SEM análise, o cartão continua existindo — com o botão de gerar.
	 *
	 * Ele fazia `if (!data) return null`: quem nunca rodou a análise não sabia
	 * que ela existe. A regra é a mesma da v1: roda SOB DEMANDA, gasta crédito
	 * no SaaS e é livre no enterprise — por isso o SaaS confirma antes e o
	 * enterprise dispara direto.
	 */
	if (!data) return <SemAnalise userId={userId} jobAppliedId={jobAppliedId} />

	const percent =
		data.humanPercent ?? (data.score !== null ? Math.round(data.score * 10) : null)
	const signals = data.signals ?? []
	const indicators = data.indicators ?? []
	const criticalFactors = data.criticalFactors ?? []
	const patterns = data.patterns ?? []
	const contextNotes = data.contextNotes ?? []

	const hasEvidence = signals.length > 0 || indicators.length > 0 || criticalFactors.length > 0
	const review = /inconclus|revisar/i.test(data.level ?? '')
	const suspicious = percent !== null && percent < 60

	/*
	 * Sem cor de alarme.
	 *
	 * Autenticidade é sinal probabilístico, não veredito — pintar o card de
	 * vermelho fazia a tela decidir pelo recrutador antes de ele ler a
	 * evidência, e um falso positivo aqui descarta uma pessoa real. O ícone
	 * muda (escudo ok / interrogação), a moldura não.
	 */
	const Icon = review || suspicious ? ShieldQuestion : ShieldCheck

	const expandable =
		hasEvidence || patterns.length > 0 || contextNotes.length > 0 || Boolean(data.summary)

	return (
		<section className='rounded-xl border border-border bg-card'>
			{/*
			 * Recolhido é UMA linha: título, nível e o percentual. O parecer e a
			 * evidência entram no expandido — quem está lendo respostas não deve
			 * perder meia tela para um dado que só importa quando gera dúvida.
			 */}
			<button
				type='button'
				onClick={() => expandable && setOpen((v) => !v)}
				aria-expanded={expandable ? open : undefined}
				className={cn(
					'flex w-full items-center gap-2 px-4 py-2.5 text-left',
					expandable ? 'cursor-pointer hover:bg-hover' : 'cursor-default',
				)}
			>
				<Icon size={14} className='shrink-0 text-text-2' />
				<h2 className='shrink-0 text-[13px] font-medium'>{t('candidate.authenticityTitle')}</h2>
				{data.level && (
					<span className='shrink-0 text-[12px] text-text-2'>{data.level}</span>
				)}

				{percent !== null && (
					<>
						<span className='ml-auto hidden h-1.5 w-24 shrink-0 rounded-full bg-data-track sm:block'>
							<span
								className='block h-1.5 rounded-full bg-text-2/50'
								style={{ width: `${Math.min(percent, 100)}%` }}
							/>
						</span>
						<span className='font-num shrink-0 text-[12.5px] font-medium sm:ml-0 ml-auto'>
							{t('candidate.humanPercent', { percent })}
						</span>
					</>
				)}

				{expandable && (
					<ChevronDown
						size={13}
						className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
					/>
				)}
			</button>

			{open && (
				<div className='flex flex-col gap-3 border-t border-border-soft px-4 py-3'>
					{data.summary && (
						<p className='text-[12px] leading-relaxed text-text-2'>{data.summary}</p>
					)}
					{criticalFactors.length > 0 && (
						<Block title={t('candidate.criticalFactors')}>
							{criticalFactors.map((factor) => (
								<li key={factor} className='flex items-start gap-2 text-[12px]'>
									<AlertTriangle size={12} className='mt-0.5 shrink-0 text-muted' />
									<span className='leading-snug text-text-2'>{factor}</span>
								</li>
							))}
						</Block>
					)}

					{signals.length > 0 && (
						<Block title={t('candidate.suspiciousSignals')}>
							{signals.map((signal, index) => (
								<li key={`${signal.label}-${index}`} className='text-[12px]'>
									<span className='font-medium'>{signal.label}</span>
									{signal.severity && (
										<span className='ml-1.5 rounded border border-border px-1 py-px text-[10px] uppercase text-muted'>
											{signal.severity}
										</span>
									)}
									{signal.detail && (
										<span className='mt-0.5 block leading-snug text-text-2'>{signal.detail}</span>
									)}
								</li>
							))}
						</Block>
					)}

					{indicators.length > 0 && (
						<Block title={t('candidate.authenticitySignals')}>
							{indicators.map((indicator, index) => (
								<li key={`${indicator.label}-${index}`} className='text-[12px]'>
									<span className='font-medium'>{indicator.label}</span>
									{indicator.weight !== null && (
										<span className='font-num ml-1.5 text-[10.5px] text-muted'>
											{t('candidate.weight', { value: indicator.weight.toFixed(2) })}
										</span>
									)}
									{indicator.detail && (
										<span className='mt-0.5 block leading-snug text-text-2'>
											{indicator.detail}
										</span>
									)}
								</li>
							))}
						</Block>
					)}

					{patterns.length > 0 && (
						<Block title={t('candidate.patterns')}>
							{patterns.map((pattern) => (
								<li key={pattern} className='text-[12px] leading-snug text-text-2'>
									{pattern}
								</li>
							))}
						</Block>
					)}

					{/* as ressalvas do próprio motor: o que ele NÃO consegue afirmar */}
					{contextNotes.length > 0 && (
						<Block title={t('candidate.contextNotes')}>
							{contextNotes.map((note) => (
								<li key={note} className='text-[12px] leading-snug text-text-2'>
									{note}
								</li>
							))}
						</Block>
					)}
				</div>
			)}
		</section>
	)
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<p className='mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted'>{title}</p>
			<ul className='flex flex-col gap-1.5'>{children}</ul>
		</div>
	)
}

/**
 * O convite para rodar a análise.
 *
 * Regra da v1 (`CandidateDetails.handleRequestAnalysis`): enterprise dispara
 * direto; SaaS confirma antes, porque a análise CONSOME CRÉDITO. Cobrar sem
 * avisar é o tipo de coisa que o cliente descobre na fatura.
 */
function SemAnalise({
	userId,
	jobAppliedId,
}: {
	userId?: string | null
	jobAppliedId?: string | null
}) {
	const { t } = useTranslation()
	const [confirmando, setConfirmando] = useState(false)
	/*
	 * ⚠️ A rota CERTA é `authenticity-analysis`, não `ai-detection`.
	 *
	 * Eu tinha ligado no `ai-detection`, que chama o engine direto e não passa
	 * por regra nenhuma: rodava a análise sem checar plano, sem checar se já
	 * havia sido comprada e sem debitar. Dava o produto de graça e sem registro.
	 *
	 * Esta faz o fluxo inteiro no servidor — enterprise livre, SaaS reaproveita
	 * compra anterior do mesmo par (candidato, vaga) e só debita quando é cobrança
	 * nova. A tela só pergunta antes; quem decide preço é o core.
	 */
	const analisar = empresa.usePostCompaniesInterviewsUserIdJobAppliedIdAuthenticityAnalysis()
	const queryClient = useQueryClient()

	const { data: companyData } = empresa.useGetCompanies()
	const plano = (companyData?.data as { company?: { subscriptionPlan?: string } } | undefined)
		?.company?.subscriptionPlan
	const enterprise = (plano ?? '').toLowerCase() === 'enterprise'

	if (!jobAppliedId || !userId) return null

	async function rodar() {
		setConfirmando(false)
		await analisar
			.mutateAsync({ userId: userId as string, jobAppliedId: jobAppliedId as string })
			.catch(() => undefined)
		// a análise é assíncrona no engine; refetch traz o resultado quando chega
		await queryClient.invalidateQueries()
	}

	return (
		<Card
			title={t('candidate.authenticityTitle')}
			description={t('candidate.authenticity.emptyHint')}
		>
			<div className='flex flex-wrap items-center gap-3'>
				<Button
					variant='secondary'
					size='sm'
					disabled={analisar.isPending}
					onClick={() => (enterprise ? void rodar() : setConfirmando(true))}
				>
					{analisar.isPending ? (
						<Loader2 size={13} className='animate-spin' />
					) : (
						<ShieldCheck size={13} />
					)}
					{analisar.isPending
						? t('candidate.authenticity.processing')
						: t('candidate.authenticity.run')}
				</Button>
				{/* o custo aparece só para quem paga por crédito — no enterprise a
				    linha não existe, como na v1 */}
				{!enterprise && (
					<span className='flex items-center gap-1.5 text-[12px] text-text-2'>
						<Zap size={13} />
						{t('candidate.authenticity.cost')}
					</span>
				)}
			</div>

			{/*
			 * O modal DA CASA, não um aviso desenhado dentro do cartão.
			 *
			 * Eu tinha aberto a confirmação em linha, empurrando a pergunta do
			 * candidato para baixo — decisão que envolve cobrança merece o mesmo
			 * peso das outras do produto, e um segundo jeito de confirmar é um
			 * segundo lugar para consertar quando o padrão mudar.
			 */}
			{confirmando && (
				<ConfirmDialog
					title={t('candidate.authenticity.modalTitle')}
					description={t('candidate.authenticity.modalBody')}
					confirmLabel={t('candidate.authenticity.confirm')}
					pending={analisar.isPending}
					onConfirm={() => void rodar()}
					onCancel={() => setConfirmando(false)}
				>
					{/* o realce do custo, como na v1: o que vai ser debitado em
					    destaque, e o que acontece logo depois de confirmar */}
					<div className='mt-3 rounded-lg border border-border bg-card-alt p-3'>
						<p className='flex items-center gap-1.5 text-[12.5px] font-medium'>
							<Zap size={13} />
							{t('candidate.authenticity.modalCredit')}
						</p>
						<p className='mt-1 text-[12px] leading-relaxed text-text-2'>
							{t('candidate.authenticity.modalCreditHint')}
						</p>
					</div>
				</ConfirmDialog>
			)}
		</Card>
	)
}
