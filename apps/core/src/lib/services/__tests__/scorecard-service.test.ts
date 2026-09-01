import { createScorecardService } from '../scorecard-service'

function makeInfra(overrides: Record<string, unknown> = {}) {
	return {
		scorecardRepository: {
			listScorecards: jest.fn().mockResolvedValue([]),
			getScorecardByAuthor: jest.fn().mockResolvedValue(null),
			createScorecard: jest.fn().mockImplementation((_c, data) => ({ id: 'sc-1', ...data })),
			updateScorecard: jest.fn().mockResolvedValue(undefined),
			deleteScorecard: jest.fn().mockResolvedValue(undefined),
			...overrides,
		},
	} as never
}

const base = {
	companyId: 'c1',
	jobId: 'j1',
	candidateId: 'cand1',
	authorId: 'user1',
	recommendation: 'yes' as const,
}

describe('scorecard do recrutador', () => {
	it('recusa avaliação vazia — sem critério e sem comentário não é opinião', async () => {
		const service = createScorecardService(makeInfra())
		await expect(
			service.upsertScorecard({ ...base, criteria: [], comment: '' }),
		).rejects.toThrow(/critério ou/)
	})

	it('recusa nota fora de 1–5', async () => {
		const service = createScorecardService(makeInfra())
		await expect(
			service.upsertScorecard({
				...base,
				criteria: [{ id: 'c', label: 'Comunicação', rating: 9 }],
			}),
		).rejects.toThrow(/entre 1 e 5/)
	})

	it('reavaliar EDITA em vez de empilhar — um autor, uma avaliação', async () => {
		const infra = makeInfra({
			getScorecardByAuthor: jest.fn().mockResolvedValue({
				id: 'sc-existente',
				companyId: 'c1',
				jobId: 'j1',
				candidateId: 'cand1',
				authorId: 'user1',
				criteria: [],
				recommendation: 'no',
				createdAt: new Date(),
			}),
		})
		const service = createScorecardService(infra)
		await service.upsertScorecard({
			...base,
			criteria: [{ id: 'c', label: 'Comunicação', rating: 4 }],
		})

		const repo = (infra as unknown as { scorecardRepository: Record<string, jest.Mock> })
			.scorecardRepository
		expect(repo.updateScorecard).toHaveBeenCalledWith('c1', 'sc-existente', expect.anything())
		expect(repo.createScorecard).not.toHaveBeenCalled()
	})

	it('não declara consenso com um único avaliador', async () => {
		const infra = makeInfra({
			listScorecards: jest.fn().mockResolvedValue([
				{
					id: 'a',
					criteria: [{ id: 'c', label: 'x', rating: 5 }],
					recommendation: 'strong_yes',
				},
			]),
		})
		const service = createScorecardService(infra)
		const result = await service.listScorecards(base)
		expect(result.summary.count).toBe(1)
		expect(result.summary.consensus).toBeNull()
	})

	it('calcula consenso a partir de dois avaliadores', async () => {
		const infra = makeInfra({
			listScorecards: jest.fn().mockResolvedValue([
				{ id: 'a', criteria: [{ id: 'c', label: 'x', rating: 5 }], recommendation: 'yes' },
				{ id: 'b', criteria: [{ id: 'c', label: 'x', rating: 3 }], recommendation: 'no' },
			]),
		})
		const service = createScorecardService(infra)
		const result = await service.listScorecards(base)
		expect(result.summary.average).toBe(4)
		expect(result.summary.consensus).toBe('positive')
	})
})
