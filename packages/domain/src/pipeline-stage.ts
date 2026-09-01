/**
 * Régua canônica de etapas do processo seletivo (ATS v2).
 *
 * Antes disto o board só conhecia `pending | selected | approved | rejected`,
 * que são *status técnicos*, não etapas de processo — e o `Applied` gravado
 * pelo apply leve (TOS-020) não tinha coluna nenhuma: quem se candidatava sem
 * entrevistar simplesmente sumia do funil do recrutador.
 *
 * A régua espelha o padrão de mercado (Greenhouse trava entrada e saída do
 * plano; Gupy usa Triagem → Avaliações → Entrevista → Proposta), mas fica
 * curta de propósito: funil longo é a dor nº1 do candidato registrada em
 * .
 *
 * Os ids são os mesmos `candidateStatus` já persistidos, em minúsculo — a
 * régua RENOMEIA o que existe, não migra dado. Comparações devem passar por
 * `normalizeStageId`, porque o banco tem casing misto (`Pending`, `pending`).
 */
export interface PipelineStage {
	id: string
	/** Rótulo default; a empresa pode sobrescrever no catálogo de colunas. */
	label: string
	labelEn: string
	order: number
	/**
	 * Etapa terminal encerra a jornada: o relógio de SLA para e o candidato
	 * não conta mais como "esperando resposta".
	 */
	terminal: boolean
	/**
	 * Fora da régua = não é passo do caminho feliz. Reprovado existe como
	 * destino, mas não como etapa que se "avança".
	 */
	offTrack?: boolean
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
	{ id: 'applied', label: 'Candidatura', labelEn: 'Applied', order: 0, terminal: false },
	{ id: 'pending', label: 'Entrevista IA', labelEn: 'AI interview', order: 1, terminal: false },
	{ id: 'selected', label: 'Selecionados', labelEn: 'Shortlisted', order: 2, terminal: false },
	{ id: 'approved', label: 'Aprovados', labelEn: 'Approved', order: 3, terminal: true },
	{ id: 'hired', label: 'Contratado', labelEn: 'Hired', order: 4, terminal: true },
	/*
	 * Candidatura que expirou sem entrevista.
	 *
	 * Numa vaga com 300 candidatos, quem se inscreve e não entrevista se
	 * acumula para sempre — a fila deixa de significar algo e ninguém olha o
	 * número. Vencer é o que mantém a contagem honesta.
	 *
	 * É `offTrack` como reprovado, mas NÃO é reprovação: ninguém avaliou essa
	 * pessoa. A distinção importa para a taxa de conversão da vaga (quantos
	 * entram e não terminam é diagnóstico da entrevista, não do candidato) e
	 * para o candidato, que pode voltar sem carregar um "reprovado" no
	 * histórico.
	 */
	{
		id: 'expired',
		label: 'Sem resposta',
		labelEn: 'No response',
		order: 6,
		terminal: true,
		offTrack: true,
	},
	{
		id: 'rejected',
		label: 'Reprovado',
		labelEn: 'Rejected',
		order: 5,
		terminal: true,
		offTrack: true,
	},
]

export const PIPELINE_STAGE_IDS = PIPELINE_STAGES.map((stage) => stage.id)

/** Etapas anteriores à régua nova — precisam existir em toda configuração. */
export const LEGACY_REQUIRED_STAGE_IDS = ['pending', 'selected', 'approved', 'rejected']

/** Banco tem casing misto e espaços; toda comparação de etapa passa por aqui. */
export function normalizeStageId(status?: string | null): string {
	const normalized = status?.trim().toLowerCase()
	return normalized ? normalized : 'pending'
}

export function findPipelineStage(id?: string | null): PipelineStage | undefined {
	const normalized = normalizeStageId(id)
	return PIPELINE_STAGES.find((stage) => stage.id === normalized)
}

export function isTerminalStage(id?: string | null): boolean {
	return findPipelineStage(id)?.terminal === true
}

/**
 * Ações por etapa (V2-105).
 *
 * O que a etapa DISPARA quando o candidato entra nela. É um conjunto fechado,
 * e de propósito: motor de regras genérico é o caminho conhecido para um
 * produto onde ninguém entende por que um e-mail saiu. Aqui cada ação é um
 * gesto que o recrutador já faz na mão hoje — a configuração só tira o clique.
 *
 * Regra que vale para todas: a ação NUNCA pode derrubar a movimentação. Mover
 * o candidato é o ato do usuário; mandar e-mail é consequência. Falha vira log
 * e resultado por candidato, não erro na tela.
 */
export const STAGE_ACTIONS = ['invite_interview', 'request_resume'] as const
export type StageAction = (typeof STAGE_ACTIONS)[number]

/**
 * Etapas que não aceitam ação.
 *
 * Reprovado tem caminho próprio (motivo tipado + e-mail de retorno, com regra
 * de anti-ghosting), e empilhar disparo genérico ali mandaria dois e-mails
 * para quem acabou de ser reprovado.
 *
 * `expired` porque a pessoa já foi lembrada e não respondeu — disparar
 * "convide para a entrevista" em cima de quem venceu por silêncio é insistir
 * com quem já disse não pelo silêncio.
 */
export const STAGE_ACTION_FORBIDDEN_STAGES = ['rejected', 'expired']

export function stageAcceptsActions(stageId?: string | null): boolean {
	return !STAGE_ACTION_FORBIDDEN_STAGES.includes(normalizeStageId(stageId))
}
