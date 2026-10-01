import { randomUUID } from 'node:crypto'

import type { InfraProvider } from '@coploy/infra'
import type {
	Company,
	InterviewSchedule,
	PostJob,
	ScheduleDeclineReason,
	ScheduleFormat,
	ScheduleJoinDetails,
	ScheduleSlot,
	UsersCompany,
} from '@coploy/domain'
import { effectiveScheduleStatus, SCHEDULE_LIMITS } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { renderScheduleProposalEmail, formatSlot } from '@/emails/process-update'
import { env } from '@/env'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { createEmailBrandingService } from '@/lib/services/email-branding-service'

/**
 * Agendamento de entrevista (OTS 0.3, `schedule_interview`) — a referência.
 *
 * A empresa propõe janelas pela ficha do candidato no ATS; o talento escolhe
 * uma pela área do candidato ou pelo assistente conectado (MCP / binding
 * REST). Proposta nova substitui a anterior (`interview.schedule_updated`).
 * O link da conversa só aparece para o talento depois de confirmar.
 */

const FROM_EMAIL = 'no-reply@coploy.io'

function refId(value: unknown): string | null {
	const path = (value as { path?: string } | undefined)?.path
	if (path) return path.split('/').pop() ?? null
	if (typeof value === 'string') return value
	return (value as { id?: string } | undefined)?.id ?? null
}

/** O card do quadro → quem é a pessoa e qual é a participação dela. */
export async function resolveBoardCandidate(infra: InfraProvider, companyId: string, jobId: string, candidateId: string) {
	const doc = (await infra.candidateRepository
		.getJobInterview(companyId, jobId, candidateId)
		.catch(() => null)) as Record<string, unknown> | null
	if (!doc) throw new NotFoundError('Candidate not found in this job')
	const userId = refId(doc.user_ref)
	const jobAppliedId = refId(doc.job_applied_ref)
	if (!userId || !jobAppliedId) throw new BadRequestError('Candidato sem participação vinculada')
	return {
		userId,
		jobAppliedId,
		email: typeof doc.email === 'string' ? doc.email : null,
		name: typeof doc.name === 'string' ? doc.name : null,
		language: typeof doc.language === 'string' ? doc.language : null,
		jobName: (doc.jobName ?? doc.job_name ?? null) as string | null,
	}
}

export interface ProposeScheduleInput {
	format: ScheduleFormat
	durationMinutes: number
	timezone: string
	slots: Array<{ start: string }>
	expiresAt?: string | null
	note?: string | null
	joinDetails?: Partial<ScheduleJoinDetails> | null
}

export type ScheduleResponseInput =
	| { action: 'confirm'; slotStart: string }
	| { action: 'decline'; reason: ScheduleDeclineReason; note?: string | null }

const clean = (value: string | null | undefined, max: number): string | null => {
	const text = value?.trim()
	return text ? text.slice(0, max) : null
}

function isHttpUrl(value: string): boolean {
	try {
		return ['http:', 'https:'].includes(new URL(value).protocol)
	} catch {
		return false
	}
}

function validTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone })
		return true
	} catch {
		return false
	}
}

/**
 * As janelas que valem: futuras, sem repetir o início, em ordem. A duração é
 * uma só para a proposta, então o fim de cada janela é derivado do início.
 */
export function normalizeSlots(slots: Array<{ start: string }>, durationMinutes: number, now = new Date()): ScheduleSlot[] {
	const seen = new Set<number>()
	const result: Array<{ time: number; slot: ScheduleSlot }> = []
	for (const { start } of slots) {
		const time = new Date(start).getTime()
		if (Number.isNaN(time)) throw new BadRequestError(`Horário inválido: ${start}`)
		if (time <= now.getTime()) throw new BadRequestError('Todos os horários precisam estar no futuro')
		if (seen.has(time)) continue
		seen.add(time)
		result.push({
			time,
			slot: { start: new Date(time).toISOString(), end: new Date(time + durationMinutes * 60_000).toISOString() },
		})
	}
	return result.sort((a, b) => a.time - b.time).map((item) => item.slot)
}

/** O que o talento pode ver: o link só depois de confirmar. */
export function candidateViewOf(schedule: InterviewSchedule, now = new Date()) {
	const status = effectiveScheduleStatus(schedule, now)
	return {
		...schedule,
		status,
		joinDetails: status === 'confirmed' ? schedule.joinDetails : null,
	}
}

export function createInterviewScheduleService(
	infra: InfraProvider,
	emailClient: EmailSender = createEmailSender(infra),
) {
	const branding = createEmailBrandingService(infra)
	const repo = infra.interviewScheduleRepository

	async function notifyCompany(schedule: InterviewSchedule, title: string, message: string) {
		await Promise.resolve(
			infra.notificationRepository.createCompanyNotification(schedule.companyId, {
				title,
				message,
				status: false,
				read: false,
				type: 'interviewSchedule',
				actionRef: `jobs/${schedule.jobId}/candidates/${schedule.candidateId}`,
				image: null,
				dateTime: new Date(),
			} as never),
		).catch((error) => console.warn('[schedule] notificação da empresa falhou:', (error as Error).message))
	}

	return {
		async listForCandidate(params: { companyId: string; jobId: string; candidateId: string }) {
			const board = await resolveBoardCandidate(infra, params.companyId, params.jobId, params.candidateId)
			const schedules = await repo.listByApplication(params.companyId, board.jobAppliedId)
			return schedules.map((schedule) => ({ ...schedule, status: effectiveScheduleStatus(schedule) }))
		},

		async propose(params: {
			companyId: string
			jobId: string
			candidateId: string
			actorId: string | null
			actorName: string | null
			input: ProposeScheduleInput
		}): Promise<InterviewSchedule> {
			const { companyId, jobId, candidateId, input } = params
			const duration = Math.round(input.durationMinutes)
			if (duration < SCHEDULE_LIMITS.minMinutes || duration > SCHEDULE_LIMITS.maxMinutes) {
				throw new BadRequestError('Duração fora do limite (5 a 480 minutos)')
			}
			if (!validTimezone(input.timezone)) throw new BadRequestError('Fuso horário inválido')
			const slots = normalizeSlots(input.slots, duration)
			if (slots.length < SCHEDULE_LIMITS.minSlots) throw new BadRequestError('Proponha ao menos um horário')
			if (slots.length > SCHEDULE_LIMITS.maxSlots) throw new BadRequestError('No máximo 20 horários por proposta')

			const meetingUrl = clean(input.joinDetails?.meetingUrl, 2000)
			if (meetingUrl && !isHttpUrl(meetingUrl)) throw new BadRequestError('O link da reunião precisa começar com http:// ou https://')
			const joinDetails: ScheduleJoinDetails | null =
				meetingUrl || input.joinDetails?.address || input.joinDetails?.instructions
					? {
							meetingUrl,
							address: clean(input.joinDetails?.address, 500),
							instructions: clean(input.joinDetails?.instructions, 1000),
						}
					: null

			const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
			if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestError('Prazo inválido')

			const board = await resolveBoardCandidate(infra, companyId, jobId, candidateId)

			// proposta nova substitui a aberta (e a já marcada: é um reagendamento)
			const previous = await repo.listByApplication(companyId, board.jobAppliedId)
			const replaced = previous.filter((schedule) => ['proposed', 'confirmed'].includes(effectiveScheduleStatus(schedule)))
			await Promise.all(replaced.map((schedule) => repo.update(schedule.id, { status: 'cancelled' })))

			const now = new Date().toISOString()
			const schedule: InterviewSchedule = {
				id: randomUUID(),
				companyId,
				jobId,
				jobAppliedId: board.jobAppliedId,
				userId: board.userId,
				candidateId,
				format: input.format,
				durationMinutes: duration,
				timezone: input.timezone,
				slots,
				status: 'proposed',
				confirmedSlot: null,
				expiresAt: expiresAt ? expiresAt.toISOString() : null,
				note: clean(input.note, 1000),
				joinDetails,
				declineReason: null,
				declineNote: null,
				respondedAt: null,
				respondedVia: null,
				proposedBy: params.actorId,
				proposedByName: params.actorName,
				createdAt: now,
				updatedAt: now,
			}
			await repo.create(schedule)

			// e-mail é aviso, não a proposta: falhar não desfaz nada
			if (board.email) {
				try {
					const [company, job, user] = await Promise.all([
						infra.companyRepository.getCompany(companyId) as Promise<Company | null>,
						infra.jobRepository.getJob(companyId, jobId) as Promise<PostJob | null>,
						Promise.resolve(infra.userRepository.getUser(board.userId)).catch(() => null) as Promise<UsersCompany | null>,
					])
					const language =
						board.language ?? ((user as unknown as Record<string, unknown> | null)?.language as string | undefined) ?? job?.language ?? 'pt-BR'
					const rendered = renderScheduleProposalEmail({
						branding: await branding.forCompanyId(companyId),
						candidateName: board.name ?? user?.display_name ?? null,
						companyName: company?.companyName ?? null,
						jobName: job?.jobName ?? board.jobName,
						format: schedule.format,
						durationMinutes: schedule.durationMinutes,
						timezone: schedule.timezone,
						slots: schedule.slots,
						note: schedule.note,
						respondUrl: env.CANDIDATE_APP_URL ? `${env.CANDIDATE_APP_URL.replace(/\/$/, '')}/interviews` : null,
						language,
						replacesPrevious: replaced.length > 0,
					})
					await emailClient.sendEmail({
						from: FROM_EMAIL,
						to: board.email,
						subject: rendered.subject,
						htmlBody: rendered.htmlBody,
						textBody: rendered.textBody,
						tag: 'interview-schedule',
					})
				} catch (error) {
					console.warn('[schedule] e-mail da proposta falhou:', (error as Error).message)
				}
			}
			return schedule
		},

		async cancel(params: { companyId: string; jobId: string; candidateId: string; scheduleId: string }) {
			const board = await resolveBoardCandidate(infra, params.companyId, params.jobId, params.candidateId)
			const schedule = await repo.getById(params.scheduleId)
			if (!schedule || schedule.companyId !== params.companyId || schedule.jobAppliedId !== board.jobAppliedId) {
				throw new NotFoundError('Proposta não encontrada')
			}
			const status = effectiveScheduleStatus(schedule)
			if (!['proposed', 'confirmed'].includes(status)) throw new BadRequestError('Esta proposta já foi encerrada')
			const updated = await repo.update(schedule.id, { status: 'cancelled' })
			return { ...(updated ?? schedule), status: 'cancelled' as const }
		},

		/** As propostas do talento, com o link só onde ele confirmou. */
		async listMine(userId: string) {
			const schedules = await repo.listByUser(userId)
			return schedules.map((schedule) => candidateViewOf(schedule))
		},

		/**
		 * A resposta do talento. Confirmar é idempotente; a janela precisa ser
		 * uma das propostas (pelo instante, não pelo texto: `-03:00` e `Z`
		 * descrevem o mesmo horário). Proposta alheia é "não encontrada".
		 */
		async respond(params: {
			userId: string
			scheduleId: string
			response: ScheduleResponseInput
			via: 'candidate_area' | 'agent'
		}) {
			const schedule = await repo.getById(params.scheduleId)
			if (!schedule || schedule.userId !== params.userId) throw new NotFoundError('Proposta não encontrada')
			const status = effectiveScheduleStatus(schedule)
			const { response } = params

			if (response.action === 'confirm') {
				const time = new Date(response.slotStart).getTime()
				if (Number.isNaN(time)) throw new BadRequestError('Horário inválido')
				if (status === 'confirmed' && schedule.confirmedSlot && new Date(schedule.confirmedSlot.start).getTime() === time) {
					return candidateViewOf(schedule)
				}
				if (status !== 'proposed') throw new BadRequestError(`Esta proposta não aceita resposta (${status})`)
				const slot = schedule.slots.find((item) => new Date(item.start).getTime() === time)
				if (!slot) throw new BadRequestError('Este horário não foi proposto pela empresa')
				if (time <= Date.now()) throw new BadRequestError('Este horário já passou')

				const updated =
					(await repo.update(schedule.id, {
						status: 'confirmed',
						confirmedSlot: slot,
						respondedAt: new Date().toISOString(),
						respondedVia: params.via,
					})) ?? schedule
				await notifyCompany(
					updated,
					'Entrevista confirmada',
					`O candidato confirmou a entrevista para ${formatSlot(slot.start, schedule.timezone)} (${schedule.timezone}).`,
				)
				return candidateViewOf(updated)
			}

			if (status !== 'proposed') throw new BadRequestError(`Esta proposta não aceita resposta (${status})`)
			const updated =
				(await repo.update(schedule.id, {
					status: 'declined',
					declineReason: response.reason,
					declineNote: clean(response.note, 1000),
					respondedAt: new Date().toISOString(),
					respondedVia: params.via,
				})) ?? schedule
			await notifyCompany(
				updated,
				'Horários recusados',
				response.reason === 'no_slot_fits'
					? 'O candidato disse que nenhum dos horários funciona. Proponha outros.'
					: 'O candidato recusou a proposta de entrevista.',
			)
			return candidateViewOf(updated)
		},
	}
}
