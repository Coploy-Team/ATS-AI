import type { InfraProvider } from '@coploy/infra'
import { normalizeStageId } from '@coploy/domain'

/**
 * Cobra quem se candidatou e não entrevistou — e vence quem não respondeu.
 *
 * Numa vaga com 300 candidatos, os não-finalizados se acumulam para sempre: a
 * fila deixa de significar algo e ninguém mais olha o número. Duas regras
 * mantêm a contagem honesta:
 *
 * - **D+2**: um lembrete, uma vez só.
 * - **D+7**: vence para `expired` ("Sem resposta").
 *
 * `expired` NÃO é reprovação: ninguém avaliou essa pessoa. A distinção importa
 * para a taxa de conversão da vaga — quantos entram e não terminam diz mais
 * sobre a entrevista (longa? confusa?) do que sobre o candidato — e para o
 * próprio candidato, que volta sem carregar um "reprovado" no histórico.
 */
export const REMINDER_AFTER_DAYS = 2
export const EXPIRE_AFTER_DAYS = 7

/** Etapas onde o relógio é do CANDIDATO, não da empresa. */
const WAITING_STAGES = ['applied', 'pending']

export interface FollowUpCandidate {
	candidateId: string
	finished?: boolean | null
	candidate_status?: string | null
	date?: unknown
	interviewReminderSentAt?: unknown
}

function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? null : parsed
	}
	// Firestore Timestamp, nas duas formas que aparecem no banco
	const ts = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
	if (typeof ts.toDate === 'function') return ts.toDate()
	const seconds = ts._seconds ?? ts.seconds
	return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

function daysSince(value: unknown, now: Date): number | null {
	const date = toDate(value)
	if (!date) return null
	return (now.getTime() - date.getTime()) / 86_400_000
}

export type FollowUpAction = 'remind' | 'expire' | 'none'

/**
 * A decisão, isolada de I/O — é o que dá para testar sem banco nem e-mail.
 *
 * Ordem importa: vencer ganha de lembrar. Alguém parado há 8 dias não deve
 * receber um lembrete no mesmo instante em que é encerrado.
 */
export function decideFollowUp(candidate: FollowUpCandidate, now: Date): FollowUpAction {
	if (candidate.finished === true) return 'none'
	if (!WAITING_STAGES.includes(normalizeStageId(candidate.candidate_status))) return 'none'

	const idade = daysSince(candidate.date, now)
	// sem data não dá para contar prazo — e chutar encerraria candidatura viva
	if (idade === null) return 'none'

	if (idade >= EXPIRE_AFTER_DAYS) return 'expire'
	if (idade >= REMINDER_AFTER_DAYS && !candidate.interviewReminderSentAt) return 'remind'
	return 'none'
}

export function createApplicationFollowUpService(
	infra: InfraProvider,
	deps: {
		/** Reusa o convite de entrevista: mesmo template, mesma máquina de envio. */
		sendReminder: (params: {
			companyId: string
			jobId: string
			candidateId: string
		}) => Promise<void>
	},
) {
	return {
		/**
		 * Varre todas as empresas, no mesmo cron do anti-ghosting.
		 *
		 * Só vaga ABERTA entra: cobrar candidato de vaga pausada ou encerrada é
		 * pedir que ele corra atrás de algo que não existe mais.
		 */
		async run(now: Date = new Date()) {
			const resultado = { jobsScanned: 0, lembrados: 0, vencidos: 0 }

			const empresas = (await infra.companyRepository
				.listCompanies()
				.catch(() => [])) as Array<{ id: string }>

			for (const empresa of empresas) {
				const vagas = (await infra.jobRepository
					.listJobs(empresa.id, {})
					.catch(() => [])) as Array<{ id: string; stopped?: boolean | null }>

				for (const vaga of vagas) {
					if (vaga.stopped === true) continue
					resultado.jobsScanned += 1

					const parcial = await this.runForJob({
						companyId: empresa.id,
						jobId: vaga.id,
						now,
					}).catch((erro) => {
						console.error('[FollowUp] falha na vaga', {
							companyId: empresa.id,
							jobId: vaga.id,
							erro: erro instanceof Error ? erro.message : erro,
						})
						return { lembrados: 0, vencidos: 0 }
					})

					resultado.lembrados += parcial.lembrados
					resultado.vencidos += parcial.vencidos
				}
			}

			return resultado
		},

		async runForJob(params: { companyId: string; jobId: string; now?: Date }) {
			const { companyId, jobId } = params
			const now = params.now ?? new Date()

			const candidatos = (await infra.candidateRepository
				.listJobInterviews(companyId, jobId, {})
				.catch(() => [])) as unknown as FollowUpCandidate[]

			let lembrados = 0
			let vencidos = 0

			for (const candidato of candidatos) {
				const acao = decideFollowUp(candidato, now)
				if (acao === 'none') continue

				if (acao === 'expire') {
					await infra.candidateRepository
						.updateJobInterview(companyId, jobId, candidato.candidateId, {
							candidate_status: 'expired',
							candidateStatus: 'expired',
							date_select: now,
						} as never)
						.then(() => {
							vencidos++
						})
						/*
						 * Falha em UM candidato não pode parar a varredura da vaga
						 * inteira — o cron roda uma vez por dia e o que ficou de fora só
						 * seria reprocessado amanhã.
						 */
						.catch((erro) => {
							console.error('[FollowUp] falha ao vencer candidatura', {
								companyId,
								jobId,
								candidateId: candidato.candidateId,
								erro: erro instanceof Error ? erro.message : erro,
							})
						})
					continue
				}

				try {
					await deps.sendReminder({ companyId, jobId, candidateId: candidato.candidateId })
					/*
					 * Marca DEPOIS do envio. Marcar antes evitaria duplicata numa falha,
					 * mas o preço é o candidato nunca receber o lembrete — e o objetivo
					 * é que ele entrevista, não que a nossa contabilidade fique bonita.
					 */
					await infra.candidateRepository.updateJobInterview(
						companyId,
						jobId,
						candidato.candidateId,
						{ interviewReminderSentAt: now } as never,
					)
					lembrados++
				} catch (erro) {
					console.error('[FollowUp] falha ao lembrar candidato', {
						companyId,
						jobId,
						candidateId: candidato.candidateId,
						erro: erro instanceof Error ? erro.message : erro,
					})
				}
			}

			return { lembrados, vencidos }
		},
	}
}
