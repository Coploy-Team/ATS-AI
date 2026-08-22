import {
	EXPIRE_AFTER_DAYS,
	REMINDER_AFTER_DAYS,
	decideFollowUp,
} from '../application-follow-up-service'

const AGORA = new Date('2026-08-19T12:00:00Z')
const diasAtras = (dias: number) =>
	new Date(AGORA.getTime() - dias * 86_400_000)

const candidatura = (extra: Record<string, unknown> = {}) => ({
	candidateId: 'c1',
	candidate_status: 'Applied',
	finished: false,
	date: diasAtras(3),
	...extra,
})

describe('cobrança e vencimento da candidatura', () => {
	it('não mexe em quem já entrevistou', () => {
		expect(decideFollowUp(candidatura({ finished: true, date: diasAtras(30) }), AGORA)).toBe('none')
	})

	it('não mexe em quem já avançou — ali o relógio é da empresa', () => {
		expect(decideFollowUp(candidatura({ candidate_status: 'selected' }), AGORA)).toBe('none')
		expect(decideFollowUp(candidatura({ candidate_status: 'rejected' }), AGORA)).toBe('none')
	})

	it(`lembra a partir de D+${REMINDER_AFTER_DAYS}`, () => {
		expect(decideFollowUp(candidatura({ date: diasAtras(1) }), AGORA)).toBe('none')
		expect(decideFollowUp(candidatura({ date: diasAtras(2) }), AGORA)).toBe('remind')
	})

	it('lembra UMA vez — quem já foi lembrado não recebe de novo', () => {
		expect(
			decideFollowUp(candidatura({ interviewReminderSentAt: diasAtras(1) }), AGORA),
		).toBe('none')
	})

	it(`vence em D+${EXPIRE_AFTER_DAYS}`, () => {
		expect(decideFollowUp(candidatura({ date: diasAtras(7) }), AGORA)).toBe('expire')
	})

	it('vencer ganha de lembrar — não se cobra e encerra no mesmo instante', () => {
		expect(decideFollowUp(candidatura({ date: diasAtras(9) }), AGORA)).toBe('expire')
	})

	it('sem data não faz nada — chutar encerraria candidatura viva', () => {
		expect(decideFollowUp(candidatura({ date: null }), AGORA)).toBe('none')
	})

	it('entende o Timestamp do Firestore nas duas formas', () => {
		const segundos = Math.floor(diasAtras(8).getTime() / 1000)
		expect(decideFollowUp(candidatura({ date: { _seconds: segundos } }), AGORA)).toBe('expire')
		expect(decideFollowUp(candidatura({ date: { seconds: segundos } }), AGORA)).toBe('expire')
	})

	it('entrevista começada e abandonada também vence — `pending` é espera do candidato', () => {
		expect(
			decideFollowUp(candidatura({ candidate_status: 'pending', date: diasAtras(10) }), AGORA),
		).toBe('expire')
	})
})
