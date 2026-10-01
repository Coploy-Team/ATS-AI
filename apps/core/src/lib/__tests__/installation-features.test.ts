/**
 * O que cada EDIÇÃO oferece .
 *
 * O teste existe por causa de um erro barato de cometer: ligar uma superfície
 * por default e descobrir na instalação do cliente que ela não tem do que
 * viver. O caso concreto é o WhatsApp — o app que atende o webhook não vai no
 * espelho público nem no plugin Motor, então oferecer o modo numa instalação
 * open criaria vaga que ninguém atende do outro lado.
 */
const ORIGINAL = process.env.INFRA_PROVIDER

/*
 * O schema de env do core MUDA com o provider: em `selfhosted` ele exige
 * Postgres, MinIO e BetterAuth, que o `jest.setup` (calibrado para GCP) não
 * define. Sem estas dummies o teste passa na máquina de quem tem `.env` de
 * desenvolvimento e quebra no CI e no clone do espelho público — que foi
 * exatamente onde ele quebrou primeiro.
 */
const ENV_SELFHOSTED = {
	POSTGRES_URL: 'postgres://user:pass@localhost:5432/test',
	MINIO_ACCESS_KEY: 'test-access',
	MINIO_SECRET_KEY: 'test-secret',
	BETTERAUTH_SECRET: 'test-secret-de-teste-com-tamanho-suficiente',
	BETTERAUTH_URL: 'http://localhost:3333',
}

function featuresCom(provider: string, extra: Record<string, string> = {}) {
	process.env.INFRA_PROVIDER = provider
	if (provider === 'selfhosted') {
		for (const [key, value] of Object.entries(ENV_SELFHOSTED)) process.env[key] = value
	}
	for (const [key, value] of Object.entries(extra)) process.env[key] = value
	let features!: ReturnType<typeof import('../installation-features').getInstallationFeatures>
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		features = require('../installation-features').getInstallationFeatures()
	})
	return features
}

afterEach(() => {
	process.env.INFRA_PROVIDER = ORIGINAL
	delete process.env.MOTOR_ENABLED
	for (const key of Object.keys(ENV_SELFHOSTED)) delete process.env[key]
})

describe('getInstallationFeatures', () => {
	it('SaaS tem tudo, WhatsApp incluso', () => {
		expect(featuresCom('gcp')).toEqual({
			motor: true,
			hunting: true,
			billing: true,
			integrations: true,
			instanceConfig: false,
			whatsapp: true,
		})
	})

	it('open nunca tem hunting, billing, integrações nem WhatsApp', () => {
		const features = featuresCom('selfhosted')
		expect(features.hunting).toBe(false)
		expect(features.billing).toBe(false)
		expect(features.integrations).toBe(false)
		expect(features.whatsapp).toBe(false)
		expect(features.instanceConfig).toBe(true)
	})

	it('o plugin Motor liga a entrevista — e ainda assim NÃO liga o WhatsApp', () => {
		const features = featuresCom('selfhosted', { MOTOR_ENABLED: 'true' })
		expect(features.motor).toBe(true)
		expect(features.whatsapp).toBe(false)
	})
})
