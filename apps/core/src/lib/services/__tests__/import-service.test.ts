import { createImportService, parseCsv } from '../import-service'
import { createMockInfra } from './mock-infra'

describe('parseCsv', () => {
	it('respeita vírgula dentro de campo entre aspas', () => {
		const rows = parseCsv('nome,cargo\n"Silva, Ana",Dev Sênior')
		expect(rows[1]).toEqual(['Silva, Ana', 'Dev Sênior'])
	})

	it('trata aspas duplas escapadas', () => {
		const rows = parseCsv('titulo\n"Dev ""Full Stack"""')
		expect(rows[1]).toEqual(['Dev "Full Stack"'])
	})

	it('remove o BOM do Excel — senão a primeira coluna nunca casa', () => {
		const rows = parseCsv('﻿jobName,level\nDev,Pleno')
		expect(rows[0][0]).toBe('jobName')
	})

	it('aceita ponto e vírgula (Excel pt-BR) e ignora linha em branco', () => {
		const rows = parseCsv('jobName;level\nDev;Pleno\n\n')
		expect(rows).toHaveLength(2)
		expect(rows[1]).toEqual(['Dev', 'Pleno'])
	})
})

describe('import-service — preview', () => {
	it('aceita cabeçalho em pt e en, com espaço ou underscore', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])

		const preview = await createImportService(infra).preview({
			companyId: 'c1',
			kind: 'jobs',
			content: 'Vaga,Nível,Cidade\nDev Backend,Pleno,Recife',
		})

		expect(preview.valid).toBe(1)
		expect(preview.sample[0]).toMatchObject({ jobName: 'Dev Backend', carrerLevel: 'Pleno' })
	})

	it('reporta o erro com o número da LINHA DO ARQUIVO', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])

		const preview = await createImportService(infra).preview({
			companyId: 'c1',
			kind: 'jobs',
			content: 'jobName,level\nDev,Pleno\n,Sênior',
		})

		expect(preview.invalid).toBe(1)
		// linha 3 do arquivo: cabeçalho é 1, primeira vaga é 2
		expect(preview.errors[0]).toMatchObject({ line: 3, field: 'jobName' })
	})

	it('conta como ATUALIZAÇÃO o que já existe por externalId', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest
			.fn()
			.mockResolvedValue([{ id: 'job-1', identifier: 'GUPY-99' }])

		const preview = await createImportService(infra).preview({
			companyId: 'c1',
			kind: 'jobs',
			content: 'externalId,jobName\nGUPY-99,Dev\nGUPY-100,QA',
		})

		expect(preview.updates).toBe(1)
		expect(preview.creates).toBe(1)
	})

	it('candidato sem e-mail nem telefone é inválido — sem contato não é alcançável', async () => {
		const infra = createMockInfra()

		const preview = await createImportService(infra).preview({
			companyId: 'c1',
			kind: 'candidates',
			content: 'nome,email\nAna,\nBruno,bruno@example.com',
		})

		expect(preview.invalid).toBe(1)
		expect(preview.errors[0].line).toBe(2)
	})

	it('preview não grava nada', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])

		await createImportService(infra).preview({
			companyId: 'c1',
			kind: 'jobs',
			content: 'jobName\nDev',
		})

		expect(infra.jobRepository.createJob).not.toHaveBeenCalled()
		expect(infra.jobRepository.updateJob).not.toHaveBeenCalled()
	})
})

describe('import-service — commit', () => {
	it('vaga importada nasce fechada: publicar é decisão, não efeito colateral', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])
		infra.jobRepository.createJob = jest.fn().mockResolvedValue({ id: 'new' })

		const result = await createImportService(infra).commit({
			companyId: 'c1',
			kind: 'jobs',
			content: 'jobName\nDev Backend',
		})

		expect(result.created).toBe(1)
		expect(infra.jobRepository.createJob).toHaveBeenCalledWith(
			'c1',
			expect.objectContaining({ public: false, stopped: true, source: 'import' }),
		)
	})

	it('grava `archived: false` — sem isso a vaga some da listagem', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])
		infra.jobRepository.createJob = jest.fn().mockResolvedValue({ id: 'new' })

		await createImportService(infra).commit({
			companyId: 'c1',
			kind: 'jobs',
			content: 'jobName\nDev Backend',
		})

		/*
		 * A listagem sempre filtra `archived == false`, e o Firestore não devolve
		 * documento sem o campo. Vaga importada sem isto é gravada e invisível.
		 */
		const payload = (infra.jobRepository.createJob as jest.Mock).mock.calls[0][1]
		expect(payload.archived).toBe(false)
		expect(payload.timeCreated).toBeInstanceOf(Date)
	})

	it('rodar de novo atualiza em vez de duplicar', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest
			.fn()
			.mockResolvedValue([{ id: 'job-1', identifier: 'EXT-1' }])
		infra.jobRepository.updateJob = jest.fn().mockResolvedValue(undefined)

		const result = await createImportService(infra).commit({
			companyId: 'c1',
			kind: 'jobs',
			content: 'externalId,jobName\nEXT-1,Dev Backend',
		})

		expect(result.updated).toBe(1)
		expect(result.created).toBe(0)
		expect(infra.jobRepository.createJob).not.toHaveBeenCalled()
	})

	it('linha inválida não interrompe as demais', async () => {
		const infra = createMockInfra()
		infra.jobRepository.listJobs = jest.fn().mockResolvedValue([])
		infra.jobRepository.createJob = jest.fn().mockResolvedValue({ id: 'new' })

		const result = await createImportService(infra).commit({
			companyId: 'c1',
			kind: 'jobs',
			content: 'jobName,level\n,Pleno\nDev Backend,Pleno\nQA,Júnior',
		})

		expect(result.failed).toBe(1)
		expect(result.created).toBe(2)
	})
})
