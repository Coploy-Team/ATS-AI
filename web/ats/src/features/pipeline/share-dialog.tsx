import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

/** O que o destinatário vai enxergar. O corte é feito no SERVIDOR. */
const SECOES = ['score', 'feedback', 'analysis'] as const
type Secao = (typeof SECOES)[number]

/**
 * Compartilhar candidatos com quem vai decidir junto.
 *
 * A v1 tinha e o ATS não — foi o Henrique quem notou, testando. O backend já
 * existia inteiro (`POST /companies/jobs/:jobId/share-links`), com o recorte por
 * seção aplicado no servidor: desmarcar "nota" não esconde na tela, o dado não
 * sai da API.
 *
 * ⚠️ O link só abre para quem JÁ tem conta na mesma empresa — o leitor valida
 * `getUserMembership`. Decisão registrada de manter assim por ora; por isso a
 * tela fala em "alguém do time" e não em "gestor externo", que seria promessa
 * falsa.
 */
export function ShareDialog({
	jobId,
	candidateIds,
	onClose,
}: {
	jobId: string
	candidateIds: string[]
	onClose: () => void
}) {
	const { t } = useTranslation()
	/*
	 * TUDO LIGADO por padrão.
	 *
	 * Eu tinha deixado "análise detalhada" desmarcada, achando que o mínimo era o
	 * seguro. Errado para o uso real: quem compartilha quer que a pessoa DECIDA
	 * junto, e material pela metade obriga a gerar outro link. Quem quiser
	 * esconder desliga — é uma escolha consciente, ao contrário de descobrir
	 * depois que faltava.
	 */
	const [secoes, setSecoes] = useState<Record<Secao, boolean>>({
		score: true,
		feedback: true,
		analysis: true,
	})
	const [codigo, setCodigo] = useState<string | null>(null)
	const [copiado, setCopiado] = useState(false)

	const criar = empresa.usePostCompaniesJobsJobIdShareLinks()

	/*
	 * O link abre no PRÓPRIO ATS.
	 *
	 * Cheguei a apontar para o visualizador da v1 e estava errado: o v1 vai ser
	 * removido, então seria um recurso novo nascendo preso a um produto em
	 * retirada. `window.location.origin` mantém o link no ambiente de quem
	 * gerou — homolog gera link de homolog.
	 */
	const url = codigo ? `${window.location.origin}/compartilhado?s=${codigo}` : null

	async function gerar() {
		const resposta = await criar.mutateAsync({
			jobId,
			data: { candidateIds, sections: { ...secoes, questions: true } },
		})
		setCodigo(resposta.data.code)
	}

	async function copiar() {
		if (!url) return
		await navigator.clipboard.writeText(url)
		setCopiado(true)
		setTimeout(() => setCopiado(false), 2000)
	}

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
			onClick={onClose}
		>
			<div
				onClick={(event) => event.stopPropagation()}
				className='w-full max-w-[420px] rounded-xl border border-border bg-card p-5'
			>
				<h2 className='font-display text-[15px] font-semibold'>{t('share.title')}</h2>
				<p className='mt-1 text-[12.5px] leading-relaxed text-muted'>
					{t('share.description', { count: candidateIds.length })}
				</p>

				{!codigo ? (
					<>
						<div className='mt-4 overflow-hidden rounded-xl border border-border'>
							{SECOES.map((secao) => (
								<Linha
									key={secao}
									titulo={t(`share.sections.${secao}`)}
									descricao={t(`share.sectionsHint.${secao}`)}
									ligado={secoes[secao]}
									onToggle={() => setSecoes((atual) => ({ ...atual, [secao]: !atual[secao] }))}
								/>
							))}
							{/*
							 * A BASE. Vai sempre — é o vídeo/áudio e as perguntas, sem os
							 * quais não há o que analisar. Aparece mesmo assim para o
							 * remetente saber o que está mandando, em vez de descobrir pelo
							 * que o destinatário reclamar.
							 */}
							<Linha
								titulo={t('share.sections.base')}
								descricao={t('share.sectionsHint.base')}
								ligado
								fixo
								selo={t('share.baseBadge')}
							/>
						</div>

						<div className='mt-4 flex justify-end gap-2'>
							<Button variant='secondary' size='sm' onClick={onClose}>
								{t('common.cancel')}
							</Button>
							<Button size='sm' onClick={() => void gerar()} disabled={criar.isPending}>
								{criar.isPending ? <Loader2 size={13} className='animate-spin' /> : <Link2 size={13} />}
								{t('share.generate')}
							</Button>
						</div>
					</>
				) : (
					<>
						<div className='mt-4 flex items-center gap-2 rounded-lg border border-border bg-card-alt px-3 py-2'>
							<span className='min-w-0 flex-1 truncate text-[12px] text-text-2'>{url}</span>
							<button
								onClick={() => void copiar()}
								aria-label={t('share.copy')}
								className={cn(
									'shrink-0 transition-colors',
									copiado ? 'text-lime-fg' : 'text-muted hover:text-text',
								)}
							>
								{copiado ? <Check size={14} /> : <Copy size={14} />}
							</button>
						</div>
						{/* dizer o limite na hora de mandar, não depois que o gestor reclamar */}
						<p className='mt-2 text-[11.5px] leading-relaxed text-muted'>{t('share.internalOnly')}</p>
						<div className='mt-4 flex justify-end'>
							<Button size='sm' onClick={onClose}>
								{t('common.done')}
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}

/**
 * Uma seção do compartilhamento.
 *
 * Interruptor e não caixa de seleção: a pergunta aqui é "isto vai ou não vai",
 * um estado ligado/desligado, e não um item de lista a marcar.
 */
function Linha({
	titulo,
	descricao,
	ligado,
	fixo,
	selo,
	onToggle,
}: {
	titulo: string
	descricao: string
	ligado: boolean
	fixo?: boolean
	selo?: string
	onToggle?: () => void
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-3 border-b border-border-soft px-3.5 py-3 last:border-0',
				!fixo && 'cursor-pointer transition-colors hover:bg-hover',
			)}
			onClick={fixo ? undefined : onToggle}
		>
			<span className='min-w-0 flex-1'>
				<span className='flex items-center gap-2'>
					<span className='text-[13px] font-medium'>{titulo}</span>
					{selo && (
						<span className='rounded border border-border px-1.5 py-px text-[10.5px] uppercase tracking-[0.04em] text-muted'>
							{selo}
						</span>
					)}
				</span>
				<span className='mt-0.5 block text-[11.5px] leading-relaxed text-muted'>{descricao}</span>
			</span>
			<button
				type='button'
				role='switch'
				aria-checked={ligado}
				aria-label={titulo}
				disabled={fixo}
				onClick={(event) => {
					event.stopPropagation()
					onToggle?.()
				}}
				className={cn(
					'relative h-5 w-9 shrink-0 rounded-full transition-colors',
					ligado ? 'bg-lime' : 'bg-border',
					fixo && 'opacity-60',
				)}
			>
				<span
					className={cn(
						'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left]',
						ligado ? 'left-[18px]' : 'left-0.5',
					)}
				/>
			</button>
		</div>
	)
}
