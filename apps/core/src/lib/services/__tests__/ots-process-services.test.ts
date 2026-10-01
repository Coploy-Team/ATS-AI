import { BadRequestError, NotFoundError } from '@coploy/shared/errors'
import { processReasonFromRejection, processStageFromRejection } from '@coploy/domain'

import { createInterviewScheduleService, normalizeSlots } from '../interview-schedule-service'
import { createProcessFeedbackService } from '../process-feedback-service'
import { createMockInfra } from './mock-infra'

const sendEmail = jest.fn().mockResolvedValue({ MessageID: 'm1' })
jest.mock('@/lib/email-sender', () => ({ createEmailSender: () => ({ sendEmail }) }))

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

const boardDoc = {
	user_ref: { path: 'users/u1' },
	job_applied_ref: { path: 'users/u1/jobsApplied/ja1' },
	email: 'ana@example.com',
	name: 'Ana',
}

function setup() {
	const infra = createMockInfra()
	infra.candidateRepository.getJobInterview.mockResolvedValue(boardDoc as never)
	infra.companyRepository.getCompany.mockResolvedValue({ companyName: 'Acme' } as never)
	infra.jobRepository.getJob.mockResolvedValue({ jobName: 'Dev React' } as never)
	infra.notificationRepository.createCompanyNotification.mockResolvedValue({ id: 'n1' } as never)
	return infra
}

function schedule(overrides: Record<string, unknown> = {}) {
	const start = inHours(48)
	return {
		id: 's1', companyId: 'c1', jobId: 'j1', jobAppliedId: 'ja1', userId: 'u1', candidateId: 'card1',
		format: 'video_call' as const, durationMinutes: 45, timezone: 'America/Sao_Paulo',
		slots: [{ start, end: new Date(new Date(start).getTime() + 45 * 60_000).toISOString() }],
		status: 'proposed' as const, confirmedSlot: null, expiresAt: null, note: null,
		joinDetails: { meetingUrl: 'https://meet.example.com/x', address: null, instructions: null },
		declineReason: null, declineNote: null, respondedAt: null, respondedVia: null,
		proposedBy: 'r1', proposedByName: 'Rita', createdAt: inHours(-1), updatedAt: inHours(-1),
		...overrides,
	}
}

beforeEach(() => sendEmail.mockClear())

describe('interview schedule (OTS 0.3)', () => {
	it('normaliza as janelas: em ordem, sem repetir e com o fim pela duração', () => {
		const a = inHours(30)
		const b = inHours(10)
		const slots = normalizeSlots([{ start: a }, { start: b }, { start: a }], 30)
		expect(slots.map((slot) => slot.start)).toEqual([new Date(b).toISOString(), new Date(a).toISOString()])
		expect(new Date(slots[0].end).getTime() - new Date(slots[0].start).getTime()).toBe(30 * 60_000)
	})

	it('recusa horário no passado', () => {
		expect(() => normalizeSlots([{ start: inHours(-2) }], 30)).toThrow(BadRequestError)
	})

	it('proposta nova substitui a aberta e avisa o candidato por e-mail', async () => {
		const infra = setup()
		infra.interviewScheduleRepository.listByApplication.mockResolvedValue([schedule({ id: 'old' })] as never)
		const service = createInterviewScheduleService(infra)
		const created = await service.propose({
			companyId: 'c1', jobId: 'j1', candidateId: 'card1', actorId: 'r1', actorName: 'Rita',
			input: { format: 'video_call', durationMinutes: 45, timezone: 'America/Sao_Paulo', slots: [{ start: inHours(24) }] },
		})
		expect(infra.interviewScheduleRepository.update).toHaveBeenCalledWith('old', { status: 'cancelled' })
		expect(created).toMatchObject({ jobAppliedId: 'ja1', userId: 'u1', status: 'proposed' })
		expect(infra.interviewScheduleRepository.create).toHaveBeenCalled()
		expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.com', tag: 'interview-schedule' }))
	})

	it('recusa link de reunião que não é http(s)', async () => {
		const service = createInterviewScheduleService(setup())
		await expect(
			service.propose({
				companyId: 'c1', jobId: 'j1', candidateId: 'card1', actorId: null, actorName: null,
				input: { format: 'video_call', durationMinutes: 30, timezone: 'America/Sao_Paulo', slots: [{ start: inHours(5) }], joinDetails: { meetingUrl: 'javascript:alert(1)' } },
			}),
		).rejects.toThrow(BadRequestError)
	})

	it('o talento não vê o link antes de confirmar', async () => {
		const infra = setup()
		infra.interviewScheduleRepository.listByUser.mockResolvedValue([schedule()] as never)
		const [mine] = await createInterviewScheduleService(infra).listMine('u1')
		expect(mine.joinDetails).toBeNull()
	})

	it('confirmar escolhe uma janela proposta, pelo instante, e mostra o link', async () => {
		const infra = setup()
		const base = schedule()
		infra.interviewScheduleRepository.getById.mockResolvedValue(base as never)
		infra.interviewScheduleRepository.update.mockImplementation(async (_id, patch) => ({ ...base, ...patch }) as never)
		// mesmo instante escrito com outro offset
		const sameInstant = new Date(base.slots[0].start).toISOString().replace('Z', '+00:00')
		const result = await createInterviewScheduleService(infra).respond({
			userId: 'u1', scheduleId: 's1', response: { action: 'confirm', slotStart: sameInstant }, via: 'agent',
		})
		expect(result.status).toBe('confirmed')
		expect(result.confirmedSlot).toEqual(base.slots[0])
		expect(result.joinDetails?.meetingUrl).toBe('https://meet.example.com/x')
		expect(infra.notificationRepository.createCompanyNotification).toHaveBeenCalled()
	})

	it('confirmar janela que a empresa não propôs é recusado', async () => {
		const infra = setup()
		infra.interviewScheduleRepository.getById.mockResolvedValue(schedule() as never)
		await expect(
			createInterviewScheduleService(infra).respond({
				userId: 'u1', scheduleId: 's1', response: { action: 'confirm', slotStart: inHours(100) }, via: 'candidate_area',
			}),
		).rejects.toThrow('não foi proposto')
	})

	it('proposta de outra pessoa é "não encontrada"', async () => {
		const infra = setup()
		infra.interviewScheduleRepository.getById.mockResolvedValue(schedule({ userId: 'outra' }) as never)
		await expect(
			createInterviewScheduleService(infra).respond({
				userId: 'u1', scheduleId: 's1', response: { action: 'decline', reason: 'no_slot_fits' }, via: 'candidate_area',
			}),
		).rejects.toThrow(NotFoundError)
	})

	it('proposta cujas janelas já passaram é expirada e não aceita resposta', async () => {
		const infra = setup()
		const past = inHours(-3)
		infra.interviewScheduleRepository.getById.mockResolvedValue(schedule({ slots: [{ start: past, end: inHours(-2) }] }) as never)
		await expect(
			createInterviewScheduleService(infra).respond({
				userId: 'u1', scheduleId: 's1', response: { action: 'decline', reason: 'other' }, via: 'candidate_area',
			}),
		).rejects.toThrow('expired')
	})
})

describe('process feedback (OTS 0.3)', () => {
	it('manda retorno com texto humano e avisa por e-mail', async () => {
		const infra = setup()
		const sent = await createProcessFeedbackService(infra).send({
			companyId: 'c1', jobId: 'j1', candidateId: 'card1', actorId: 'r1', actorName: 'Rita',
			stage: 'advanced', message: 'Você passou para a conversa com o time.', nextStep: 'Aguarde a proposta de horário.',
		})
		expect(sent).toMatchObject({ stage: 'advanced', reasonCode: null, source: 'recruiter', jobAppliedId: 'ja1' })
		expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'process-feedback' }))
	})

	it('encerrar o processo pelo retorno é recusado (é o quadro que reprova)', async () => {
		await expect(
			createProcessFeedbackService(setup()).send({
				companyId: 'c1', jobId: 'j1', candidateId: 'card1', actorId: null, actorName: null,
				stage: 'not_selected', message: 'Não seguimos.',
			}),
		).rejects.toThrow(BadRequestError)
	})

	it('reprovação vira not_selected com o motivo só quando o candidato pode vê-lo', async () => {
		const infra = setup()
		const service = createProcessFeedbackService(infra)
		await service.recordFromRejection({
			companyId: 'c1', jobId: 'j1', candidateId: 'card1', interview: boardDoc, message: 'Seguimos com mais experiência.',
			rejectionReasonCode: 'experiencia_insuficiente', actorId: 'r1', actorName: 'Rita',
		})
		await service.recordFromRejection({
			companyId: 'c1', jobId: 'j1', candidateId: 'card1', interview: boardDoc, message: 'Não seguimos.',
			rejectionReasonCode: 'perfil_nao_aderente', actorId: 'r1', actorName: 'Rita',
		})
		const created = infra.processFeedbackRepository.create.mock.calls.map(([feedback]) => feedback)
		expect(created[0]).toMatchObject({ stage: 'not_selected', reasonCode: 'insufficient_experience', source: 'rejection' })
		expect(created[1]).toMatchObject({ stage: 'not_selected', reasonCode: null })
	})

	it('de-para do Anexo A', () => {
		expect(processReasonFromRejection('contratado_outro')).toBe('other_candidate_hired')
		expect(processReasonFromRejection('outro')).toBeNull()
		expect(processStageFromRejection('posicao_cancelada')).toBe('position_closed')
		expect(processStageFromRejection('nao_atende_requisitos')).toBe('not_selected')
	})

	it('falha no registro não derruba a reprovação', async () => {
		const infra = setup()
		infra.processFeedbackRepository.create.mockRejectedValue(new Error('down'))
		await expect(
			createProcessFeedbackService(infra).recordFromRejection({
				companyId: 'c1', jobId: 'j1', candidateId: 'card1', interview: boardDoc, message: 'x',
				rejectionReasonCode: null, actorId: null, actorName: null,
			}),
		).resolves.toBeUndefined()
	})
})
