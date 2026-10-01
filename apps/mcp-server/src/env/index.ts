import { config } from 'dotenv'
import { z } from 'zod'

import { createEnv, infraEnvSchema } from '@coploy/shared/env'

config()
config({ path: `.env.${process.env.INFRA_PROVIDER === 'selfhosted' ? 'local' : (process.env.INFRA_PROVIDER ?? 'gcp')}`, override: true })

const DEV_ONLY_SIGNING_SECRET = 'dev-only-signing-secret-change-me'

/** Endereço opcional: '' (o que o compose passa quando a variável não existe) vira ausente. */
const semHost = z.string().transform((v) => (v.trim() === '' ? undefined : v.trim()))

const parsed = createEnv(
	z.object({
		INFRA_PROVIDER: z.enum(['gcp', 'selfhosted']).default('gcp'),
		NODE_ENV: z.enum(['homolog', 'production', 'testing']).default('homolog'),
		PORT: z.coerce.number().optional(),
		SERVER_PORT: z.coerce.number().default(5558),

		...infraEnvSchema(),

		// Firebase API Key (GCP only — exigido pelo createGcpProvider e pelo
		// exchange customToken→idToken do Identity Toolkit)
		FIREBASE_API_KEY: z.string().optional(),

		// Base URL do app de entrevista do candidato (mesmo formato do gupy-connector).
		// VAZIO = esta instalação não tem o Motor (distribuição open sem o plugin):
		// as tools de entrevista respondem que não há motor em vez de gerar link morto.
		INTERVIEW_BASE_URL: semHost.optional(),

		// Orchestrator HTTP (entrevista = GET /interview/session autenticado)
		ORCHESTRATOR_BASE_URL: semHost.optional(),

		// Portal público de vagas (web/careers). Sem o Motor, é para cá que a
		// vaga aponta: o candidato se candidata pelo portal da instância.
		CAREERS_BASE_URL: semHost.optional(),

		// Core HTTP (perfil do candidato + entrevista de perfil)
		CORE_BASE_URL: z.string().default('http://localhost:3333'),
		/**
		 * A área do candidato — para onde mandar quem quer anexar o currículo.
		 *
		 * O arquivo não trafega pelo assistente (o protocolo troca JSON, e o
		 * modelo recebe o TEXTO extraído, não os bytes do PDF). Então a tool
		 * entrega o caminho em vez de fingir que sobe.
		 */
		// VAZIO = esta instalação não tem a área do candidato (ela é da rede Coploy,
		// não da distribuição open): o link de upload do currículo não existe.
		CANDIDATE_APP_URL: semHost.optional(),

		// OAuth 2.1 (fase 1)
		// Base pública deste serviço — issuer dos metadados e das URLs de authorize/token.
		// Em homolog: https://api-hml.coploy.io/mcp-server
		PUBLIC_BASE_URL: z.string().default('http://localhost:5558'),
		// Secret HS256 dos tokens stateless (client_id DCR, code, access, refresh).
		MCP_OAUTH_SIGNING_SECRET: z.string().default(DEV_ONLY_SIGNING_SECRET),
		// true → /mcp exige Bearer (dispara descoberta OAuth nos clients);
		// false → modo fase 0 (tools públicas anônimas), tools de conta ficam ocultas.
		MCP_REQUIRE_AUTH: z
			.string()
			.default('false')
			.transform((v) => v === 'true'),
	}),
)

// O padrão "dev-only" existe para subir local sem configurar nada. Em
// produção ele assinaria client_id, code, access e refresh com um segredo que
// está no repositório — e o repositório vai ser público (F1).
if (parsed.NODE_ENV === 'production' && parsed.MCP_OAUTH_SIGNING_SECRET === DEV_ONLY_SIGNING_SECRET) {
	throw new Error('MCP_OAUTH_SIGNING_SECRET is required in production (the dev-only default is refused)')
}

export const env = {
	...parsed,
	SERVER_PORT: parsed.PORT ?? parsed.SERVER_PORT,
}
