import { createCandidateTimelineService } from '../candidate-timeline-service'

function makeInfra(entries: unknown[] = []) {
	return {
		candidateTimelineRepository: {
			listTimeline: jest.fn().mockResolvedValue(entries),
			appendEntry: jest.fn().mockImplementation((_c, data) => ({ id: 'e1', ...data })),
			updateEntry: jest.fn().mockResolvedValue(undefined),
			deleteEntry: jest.fn().mockResolvedValue(undefined),
		},
	} as never
}

const base = { companyId: 'c1', jobId: 'j1', candidateId: 'cand1' }

describe('timeline do candidato', () => {
	it('recusa comentário vazio', async () => {
		const service = createCandidateTimelineService(makeInfra())
		await expect(
			service.addComment({ ...base, authorId: 'u1', body: '   ' }),
		).rejects.toThrow(/vazio/)
	})

	it('evento de sistema NUNCA derruba o fluxo que o chamou', async () => {
		const infra = {
			candidateTimelineRepository: {
				listTimeline: jest.fn(),
				appendEntry: jest.fn().mockRejectedValue(new Error('firestore fora')),
				updateEntry: jest.fn(),
				deleteEntry: jest.fn(),
			},
		} as never
		const service = createCandidateTimelineService(infra)
		// não lança: mover o candidato importa mais que registrar o histórico
		await expect(
			service.recordEvent({ ...base, type: 'stage_changed', metadata: { to: 'selected' } }),
		).resolves.toBeUndefined()
	})

	it('evento de sistema não é editável', async () => {
		const service = createCandidateTimelineService(
			makeInfra([{ id: 'e1', type: 'stage_changed', authorId: 'u1' }]),
		)
		await expect(
			service.editComment({ ...base, entryId: 'e1', authorId: 'u1', body: 'novo' }),
		).rejects.toThrow(/não é editável/)
	})

	it('só o autor edita o próprio comentário', async () => {
		const service = createCandidateTimelineService(
			makeInfra([{ id: 'e1', type: 'comment', authorId: 'outro' }]),
		)
		await expect(
			service.editComment({ ...base, entryId: 'e1', authorId: 'u1', body: 'novo' }),
		).rejects.toThrow(/Só o autor/)
	})
})
