import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import { toOtsProcessFeedback, toOtsSchedule } from '../ots-binding'
import type { MyProcessFeedback, MySchedule } from '../core-client'

/**
 * O mapeador do 0.3 contra o schema NORMATIVO do artefato: se o wire divergir
 * do protocolo, quebra aqui, não no agente de alguém.
 */
const schemaDir = join(__dirname, '../../../../../packages/ots-contract/0.3/schemas')
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const validateSchedule = ajv.compile(JSON.parse(readFileSync(join(schemaDir, 'interview-schedule.schema.json'), 'utf8')))
const validateFeedback = ajv.compile(JSON.parse(readFileSync(join(schemaDir, 'process-feedback.schema.json'), 'utf8')))

const base: MySchedule = {
	id: 's1', companyId: 'c1', jobId: 'j1', jobAppliedId: 'ja1', jobName: 'Dev React', companyName: 'Acme',
	format: 'video_call', durationMinutes: 45, timezone: 'America/Sao_Paulo',
	slots: [{ start: '2026-10-02T17:00:00.000Z', end: '2026-10-02T17:45:00.000Z' }],
	status: 'proposed', confirmedSlot: null, expiresAt: null, note: 'Conversa com o time',
	joinDetails: { meetingUrl: 'https://meet.example.com/x', address: null, instructions: null },
	declineReason: null, declineNote: null, respondedAt: null, respondedVia: null,
	createdAt: '2026-09-30T12:00:00.000Z', updatedAt: '2026-09-30T12:00:00.000Z',
}

describe('binding OTS 0.3', () => {
	it('proposta aberta é um InterviewSchedule válido e sem link', () => {
		const wire = toOtsSchedule(base)
		expect(validateSchedule(wire)).toBe(true)
		expect(wire.joinDetails).toBeNull()
		expect(wire.processEntryId).toBe('ja1')
		expect(wire).not.toHaveProperty('respondedVia')
	})

	it('confirmada carrega a janela e o link, e continua válida', () => {
		const wire = toOtsSchedule({ ...base, status: 'confirmed', confirmedSlot: base.slots[0] })
		expect(validateSchedule(wire)).toBe(true)
		expect(wire.joinDetails?.meetingUrl).toBe('https://meet.example.com/x')
	})

	it('retorno é um ProcessFeedback válido e não leva motivo fora do encerramento', () => {
		const feedback: MyProcessFeedback = {
			id: 'f1', companyId: 'c1', jobId: 'j1', jobAppliedId: 'ja1', jobName: 'Dev React', companyName: 'Acme',
			stage: 'advanced', message: 'Você passou para a conversa com o time.',
			reasonCode: 'salary_mismatch', nextStep: null, sentAt: '2026-09-30T12:00:00.000Z',
		}
		const wire = toOtsProcessFeedback(feedback)
		expect(wire.reasonCode).toBeNull()
		expect(validateFeedback(wire)).toBe(true)
		const closed = toOtsProcessFeedback({ ...feedback, stage: 'not_selected', reasonCode: 'insufficient_experience' })
		expect(validateFeedback(closed)).toBe(true)
	})
})
