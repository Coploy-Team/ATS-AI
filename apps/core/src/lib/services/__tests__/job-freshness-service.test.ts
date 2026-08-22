import type { PostJob } from '@coploy/domain'

import { daysBetween, isStale } from '../job-freshness-service'

const NOW = new Date('2026-08-16T12:00:00.000Z')

function job(overrides: Partial<PostJob> = {}): PostJob {
	return {
		id: 'job-1',
		public: true,
		stopped: false,
		freshnessSlaDays: 30,
		...overrides,
	} as PostJob
}

describe('job-freshness-service', () => {
	it('pausa vaga pública parada além do prazo declarado', () => {
		const lastActivity = new Date('2026-07-01T12:00:00.000Z') // 46 dias
		expect(isStale(job(), lastActivity, NOW)).toBe(true)
	})

	it('não pausa vaga dentro do prazo', () => {
		const lastActivity = new Date('2026-08-01T12:00:00.000Z') // 15 dias
		expect(isStale(job(), lastActivity, NOW)).toBe(false)
	})

	it('vaga sem prazo declarado fica de fora — não há promessa a cobrar', () => {
		const lastActivity = new Date('2025-01-01T00:00:00.000Z')
		expect(isStale(job({ freshnessSlaDays: null }), lastActivity, NOW)).toBe(false)
		expect(isStale(job({ freshnessSlaDays: 0 }), lastActivity, NOW)).toBe(false)
	})

	it('vaga já despublicada ou parada não é tocada de novo', () => {
		const lastActivity = new Date('2025-01-01T00:00:00.000Z')
		expect(isStale(job({ public: false }), lastActivity, NOW)).toBe(false)
		expect(isStale(job({ stopped: true }), lastActivity, NOW)).toBe(false)
	})

	it('sem nenhuma atividade conhecida não pausa — ausência de dado não é prova de abandono', () => {
		expect(isStale(job(), null, NOW)).toBe(false)
	})

	it('conta dias corridos, coerente com a definição de métrica', () => {
		expect(daysBetween(new Date('2026-08-01T00:00:00.000Z'), NOW)).toBe(15)
	})
})
