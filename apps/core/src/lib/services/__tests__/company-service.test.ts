import {
	createCompanyService,
	generateSlug,
	splitFullName,
} from '../company-service'
import { createMockInfra } from './mock-infra'

describe('generateSlug', () => {
	it('lowercases and replaces spaces with hyphens', () => {
		expect(generateSlug('Minha Empresa')).toBe('minha-empresa')
	})

	it('removes accents and collapses whitespace around special chars', () => {
		// ç → c (NFD: c + cedilla removed), í → i, & removed, spaces collapsed
		expect(generateSlug('Açaí & Cia')).toBe('acai-cia')
	})

	it('strips leading and trailing hyphens', () => {
		expect(generateSlug('  -Empresa-  ')).toBe('empresa')
	})

	it('collapses multiple spaces', () => {
		expect(generateSlug('A   B')).toBe('a-b')
	})

	it('returns empty string for blank input', () => {
		expect(generateSlug('   ')).toBe('')
	})
})

describe('splitFullName', () => {
	it('splits first and last name', () => {
		expect(splitFullName('João Silva')).toEqual({ firstName: 'João', lastName: 'Silva' })
	})

	it('handles multi-word last names', () => {
		expect(splitFullName('Maria das Dores')).toEqual({ firstName: 'Maria', lastName: 'das Dores' })
	})

	it('returns the same word for both when single token', () => {
		expect(splitFullName('Monônimo')).toEqual({ firstName: 'Monônimo', lastName: 'Monônimo' })
	})
})

// ─── createCompanyService ────────────────────────────────────────────────────

describe('createCompanyService', () => {
	const COMPANY_ID = 'company-abc'

	const makeCompany = (overrides = {}) => ({
		id: COMPANY_ID,
		companyName: 'Teste SA',
		subscriptionPlan: 'pro',
		subscriptionDetails: {
			plan: 'pro',
			status: 'active',
			startAt: new Date('2024-01-01'),
			endAt: new Date('2099-12-31'), // Far future — not expired
			stripeCustomerId: 'cus_abc',
		},
		subscriptionCredits: {
			creditsMonthly: 100,
			creditsFixed: 10,
			creditsCourtesy: 5,
		},
		...overrides,
	})

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createCompanyService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createCompanyService(infra)
	})

	// ─── getCompany ──────────────────────────────────────────────────────────

	describe('getCompany', () => {
		it('returns normalized company when found', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(makeCompany() as never)

			const result = await service.getCompany(COMPANY_ID)

			expect(infra.companyRepository.getCompany).toHaveBeenCalledWith(COMPANY_ID)
			expect(result.plan).toBe('pro')
			expect(result.subscriptionCredits.creditsTotal).toBe(115) // 100+10+5
		})

		it('throws when company not found', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(null)
			await expect(service.getCompany(COMPANY_ID)).rejects.toThrow('Company not found')
		})

		it('resets plan to free when pro plan is expired', async () => {
			const expired = makeCompany({
				subscriptionPlan: 'pro',
				subscriptionDetails: {
					plan: 'pro',
					status: 'active',
					startAt: new Date('2023-01-01'),
					endAt: new Date('2023-12-31'), // past date — expired
				},
				subscriptionCredits: {
					creditsMonthly: 200,
					creditsFixed: 0,
					creditsCourtesy: 0,
				},
			})
			infra.companyRepository.getCompany.mockResolvedValue(expired as never)

			const result = await service.getCompany(COMPANY_ID)

			expect(result.plan).toBe('free')
			expect(result.subscriptionCredits.creditsMonthly).toBe(0)
			expect(result.subscriptionCredits.creditsTotal).toBe(0)
		})

		it('resets plan to free when premium plan is expired', async () => {
			const expired = makeCompany({
				subscriptionPlan: 'premium',
				subscriptionDetails: {
					plan: 'premium',
					status: 'active',
					endAt: new Date('2020-01-01'), // expired
				},
				subscriptionCredits: { creditsMonthly: 500, creditsFixed: 0, creditsCourtesy: 0 },
			})
			infra.companyRepository.getCompany.mockResolvedValue(expired as never)

			const result = await service.getCompany(COMPANY_ID)

			expect(result.plan).toBe('free')
			expect(result.subscriptionCredits.creditsMonthly).toBe(0)
		})

		it('keeps active paid plan unchanged', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(makeCompany() as never)
			const result = await service.getCompany(COMPANY_ID)
			expect(result.plan).toBe('pro')
			expect(result.subscriptionCredits.creditsMonthly).toBe(100)
		})

		it('normalizes Date objects to ISO strings in subscriptionDetails', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(makeCompany() as never)
			const result = await service.getCompany(COMPANY_ID)
			expect(typeof result.subscriptionDetails.startAt).toBe('string')
			expect(typeof result.subscriptionDetails.endAt).toBe('string')
		})

		it('computes creditsTotal correctly', async () => {
			const company = makeCompany({
				subscriptionCredits: { creditsMonthly: 50, creditsFixed: 20, creditsCourtesy: 3 },
			})
			infra.companyRepository.getCompany.mockResolvedValue(company as never)
			const result = await service.getCompany(COMPANY_ID)
			expect(result.subscriptionCredits.creditsTotal).toBe(73)
		})
	})

	// ─── createCompany ───────────────────────────────────────────────────────

	describe('createCompany', () => {
		it('generates slug from companyName and calls createCompany', async () => {
			const created = makeCompany()
			infra.companyRepository.createCompany.mockResolvedValue(created as never)

			await service.createCompany({ companyName: 'Startup LTDA' } as never)

			expect(infra.companyRepository.createCompany).toHaveBeenCalledWith(
				expect.objectContaining({
					companyName: 'Startup LTDA',
					features: { useEngineProcessing: true },
				}),
				expect.stringContaining('startup-ltda'),
			)
		})
	})

	// ─── updateCompany ───────────────────────────────────────────────────────

	describe('updateCompany', () => {
		it('updates and returns normalized company', async () => {
			const updated = makeCompany({ companyName: 'Updated SA' })
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)
			infra.companyRepository.getCompany.mockResolvedValue(updated as never)

			const result = await service.updateCompany(COMPANY_ID, { companyName: 'Updated SA' } as never)

			expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({ companyName: 'Updated SA' }),
			)
			expect(result.companyName).toBe('Updated SA')
		})

		it('throws when updated company cannot be retrieved', async () => {
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)
			infra.companyRepository.getCompany.mockResolvedValue(null)
			await expect(service.updateCompany(COMPANY_ID, {} as never)).rejects.toThrow(
				'Failed to retrieve updated company',
			)
		})
	})

	// ─── patchCompany ────────────────────────────────────────────────────────

	describe('patchCompany', () => {
		/*
		 * O logo salvava sem salvar: a rota aceitava, `stripProtectedCompanyFields`
		 * apagava o campo antes de gravar e a resposta vinha 200 com o valor
		 * antigo. O Henrique trocou, viu 200, atualizou a página e continuou o
		 * logo velho.
		 */
		it('grava o logo — ele é o único protegido que o PATCH pode mudar', async () => {
			const existing = makeCompany()
			infra.companyRepository.getCompany.mockResolvedValue(existing as never)
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)

			await service.patchCompany(COMPANY_ID, { companLogo: 'https://x/novo.png' } as never)

			expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({ companLogo: 'https://x/novo.png' }),
			)
		})

		it('os demais protegidos continuam barrados', async () => {
			const existing = makeCompany()
			infra.companyRepository.getCompany.mockResolvedValue(existing as never)
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)

			await service.patchCompany(COMPANY_ID, {
				companyName: 'Nova',
				subscriptionPlan: 'enterprise',
				subscriptionCredits: 99999,
				featureFlags: { antiGhosting: true },
			} as never)

			const gravado = infra.companyRepository.updateCompany.mock.calls[0][1] as Record<string, unknown>
			expect(gravado.companyName).toBe('Nova')
			expect(gravado.subscriptionPlan).toBeUndefined()
			expect(gravado.subscriptionCredits).toBeUndefined()
			expect(gravado.featureFlags).toBeUndefined()
		})

		it('throws when company not found before patch', async () => {
			infra.companyRepository.getCompany.mockResolvedValue(null)
			await expect(service.patchCompany(COMPANY_ID, {} as never)).rejects.toThrow('Company not found')
		})

		it('updates and returns normalized company', async () => {
			const existing = makeCompany()
			const patched = makeCompany({ companyName: 'Patched' })
			infra.companyRepository.getCompany
				.mockResolvedValueOnce(existing as never) // check exists
				.mockResolvedValueOnce(patched as never) // after update
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)

			const result = await service.patchCompany(COMPANY_ID, { companyName: 'Patched' } as never)

			expect(result.companyName).toBe('Patched')
		})
	})

	// ─── uploadLogo ──────────────────────────────────────────────────────────

	describe('uploadLogo', () => {
		it('uploads file, updates company logo and returns company', async () => {
			const logoUrl = 'https://storage.example.com/logo.png'
			const updated = makeCompany({ companLogo: logoUrl })
			infra.storage.uploadFile.mockResolvedValue(logoUrl as never)
			infra.companyRepository.updateCompany.mockResolvedValue(undefined)
			infra.companyRepository.getCompany.mockResolvedValue(updated as never)

			const result = await service.uploadLogo(COMPANY_ID, Buffer.from('img'), 'image/png')

			expect(infra.storage.uploadFile).toHaveBeenCalledWith(
				expect.any(Buffer),
				'companies',
				COMPANY_ID,
				'image/png',
			)
			expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(
				COMPANY_ID,
				{ companLogo: logoUrl },
			)
			expect(result).toBeDefined()
		})
	})
})
