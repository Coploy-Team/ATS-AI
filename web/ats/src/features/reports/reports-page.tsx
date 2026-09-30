import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { downloadCsv, fetchAllJobsForExport, jobsToCsv } from '@/features/jobs/export-csv'
import { Card, Page } from '@/ui/page'
import { ScreenAside, TwoCol } from '@/ui/screen-aside'
import { SkeletonCard } from '@/ui/skeleton'

/**
 * Relatórios.
 *
 * A capacidade já existia — e era um botão escondido dentro da tela de uma vaga.
 * Quem precisava do arquivo tinha que saber de cor por onde entrar, e quem não
 * sabia concluía que o produto não exportava nada. A tela não inventa relatório
 * novo: dá endereço ao que já se gerava.
 *
 * ⚠️ O relatório roda em SEGUNDO PLANO no servidor (é o mesmo caminho que o
 * recorte por papel atravessa), então aqui há um `uid` e uma espera — não é
 * download direto. A espera é mostrada porque planilha de base grande demora, e
 * botão que parece travado faz a pessoa clicar de novo e gerar duas vezes.
 */
export function ReportsPage() {
	const { t } = useTranslation()
	const [escopoVagas, setEscopoVagas] = useState<'active' | 'all'>('active')
	const [exportandoVagas, setExportandoVagas] = useState(false)
	const { can } = useCapabilities()
	const podeLer = can('analytics:read')

	const [vagaSelecionada, setVagaSelecionada] = useState('')
	const [uid, setUid] = useState<string | null>(null)
	const [erro, setErro] = useState<string | null>(null)

	const { data: vagasData, isLoading: carregandoVagas } =
		empresa.useGetCompaniesJobs({ limit: '100' })
	const vagas = ((vagasData?.data as { jobs?: Array<{ id: string; jobName?: string }> })
		?.jobs ?? []) as Array<{ id: string; jobName?: string }>

	const gerar = empresa.usePostGenerateExcelReport()

	/*
	 * Só consulta enquanto há um pedido em curso, e para sozinho quando o arquivo
	 * fica pronto: `refetchInterval` que não desliga vira consulta eterna na aba
	 * aberta e esquecida.
	 */
	const { data: relatorio } = empresa.useGetGetExcelReportUidTemporario(uid ?? '', {
		query: {
			enabled: Boolean(uid),
			refetchInterval: (query) => {
				const status = (query.state.data?.data as { status?: string } | undefined)?.status
				return status === 'completed' || status === 'error' ? false : 2500
			},
		},
	})

	const payload = relatorio?.data as
		| { status?: string; base64Excel?: string | null; message?: string; progress?: unknown }
		| undefined
	const pronto = payload?.status === 'completed' && Boolean(payload.base64Excel)
	const processando = Boolean(uid) && !pronto && payload?.status !== 'error'

	useEffect(() => {
		if (payload?.status === 'error') {
			setErro(payload.message ?? t('reports.error'))
			setUid(null)
		}
	}, [payload, t])

	async function pedir() {
		if (!vagaSelecionada) return
		setErro(null)
		try {
			const res = await gerar.mutateAsync({ data: { refId: vagaSelecionada } })
			const uidNovo = (res.data as { uid_temporario?: string }).uid_temporario
			if (!uidNovo) throw new Error('sem uid')
			setUid(uidNovo)
		} catch {
			setErro(t('reports.error'))
		}
	}

	/*
	 * O arquivo vem em base64 no corpo, não como URL: quem baixa é o browser, a
	 * partir do que já está em memória. Sem passo de rede a mais e sem link
	 * temporário que expira antes de a pessoa clicar.
	 */
	function baixar() {
		if (!payload?.base64Excel) return
		const vaga = vagas.find((v) => v.id === vagaSelecionada)
		const a = document.createElement('a')
		a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${payload.base64Excel}`
		a.download = `${vaga?.jobName ?? 'relatorio'}.xlsx`
		a.click()
	}

	if (!podeLer) {
		return (
			<Page title={t('reports.title')} subtitle={t('reports.subtitle')}>
				<Card title={t('reports.deniedTitle')}>
					<p className='text-[13px] text-text-2'>{t('reports.deniedBody')}</p>
				</Card>
			</Page>
		)
	}

	return (
		<Page title={t('reports.title')} subtitle={t('reports.subtitle')}>
			<TwoCol aside={<ScreenAside ns='reports' links={[{ key: 'analytics', to: '/analytics' }, { key: 'candidates', to: '/candidatos' }]} />}>
				<Card title={t('reports.candidatesTitle')} description={t('reports.candidatesHint')}>
					{carregandoVagas ? (
						<SkeletonCard lines={2} />
					) : vagas.length === 0 ? (
						<p className='text-[13px] text-text-2'>{t('reports.noJobs')}</p>
					) : (
						<div className='flex flex-wrap items-center gap-2'>
							<select
								value={vagaSelecionada}
								onChange={(e) => {
									setVagaSelecionada(e.target.value)
									setUid(null)
									setErro(null)
								}}
								className='h-9 min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
							>
								<option value=''>{t('reports.pickJob')}</option>
								{vagas.map((vaga) => (
									<option key={vaga.id} value={vaga.id}>
										{vaga.jobName ?? vaga.id}
									</option>
								))}
							</select>

							{pronto ? (
								<Button onClick={baixar}>
									<Download size={13} /> {t('reports.download')}
								</Button>
							) : (
								<Button
									onClick={() => void pedir()}
									disabled={!vagaSelecionada || processando || gerar.isPending}
								>
									{processando || gerar.isPending ? (
										<>
											<Loader2 size={13} className='animate-spin' /> {t('reports.generating')}
										</>
									) : (
										<>
											<FileSpreadsheet size={13} /> {t('reports.generate')}
										</>
									)}
								</Button>
							)}
						</div>
					)}

					{processando && (
						<p className='mt-2 text-[12px] text-text-2'>{t('reports.generatingHint')}</p>
					)}
					{erro && <p className='mt-2 text-[12px] text-danger'>{erro}</p>}
				</Card>

				{/* a planilha de VAGAS: o que a operação tem, além dos candidatos de uma vaga */}
				<Card title={t('reports.jobsTitle')} description={t('reports.jobsHint')}>
					<div className='flex flex-wrap items-center gap-2'>
						<select
							value={escopoVagas}
							onChange={(e) => setEscopoVagas(e.target.value as 'active' | 'all')}
							className='h-9 min-w-[200px] rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						>
							<option value='active'>{t('reports.jobsActive')}</option>
							<option value='all'>{t('reports.jobsAll')}</option>
						</select>
						<Button
							disabled={exportandoVagas}
							onClick={async () => {
								setExportandoVagas(true)
								try {
									const all = await fetchAllJobsForExport({ status: escopoVagas } as never)
									const csv = jobsToCsv(all, {
										title: t('jobs.colJob'),
										meta: t('export.meta'),
										status: t('jobs.colStatus'),
										priority: t('jobs.filterPriority'),
										candidates: t('jobs.colCandidates'),
										stages: t('jobs.colStages'),
										openFor: t('export.openForDays'),
										sla: t('jobs.colSla'),
										creator: t('jobs.colCreator'),
										status_aberta: t('jobs.statusOpen'),
										status_pausada: t('jobs.statusPaused'),
										status_fechada: t('jobs.statusClosed'),
										status_rascunho: t('jobs.statusDraft'),
										status_arquivada: t('jobs.statusArchived'),
									} as never)
									downloadCsv(csv, `vagas-${new Date().toISOString().slice(0, 10)}.csv`)
								} finally {
									setExportandoVagas(false)
								}
							}}
						>
							{exportandoVagas ? <Loader2 size={13} className='animate-spin' /> : <FileSpreadsheet size={13} />}
							{t('reports.jobsDownload')}
						</Button>
					</div>
				</Card>
			</TwoCol>
		</Page>
	)
}
