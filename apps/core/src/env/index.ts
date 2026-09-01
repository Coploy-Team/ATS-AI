import { config } from 'dotenv'
import { z } from 'zod'

config()
config({ path: `.env.${process.env.INFRA_PROVIDER === 'selfhosted' ? 'local' : (process.env.INFRA_PROVIDER ?? 'gcp')}`, override: true })

import {
	createEnv,
	infraEnvSchema,
	isGcp,
	isSelfHosted,
	selfHostedQueueEnvSchema,
} from '@coploy/shared/env'

export const env = createEnv(
	z.object({
		INFRA_PROVIDER: z.enum(['gcp', 'selfhosted']).default('gcp'),
		NODE_ENV: z.enum(['homolog', 'production', 'testing']).default('homolog'),
		SERVER_PORT: z.coerce.number().default(3333),

		...infraEnvSchema(),

		...(isGcp()
			? {
					FIREBASE_API_KEY: z.string(),
					FIREBASE_AUTH_DOMAIN: z.string(),
					FIREBASE_MESSAGING_SENDER_ID: z.string(),
					FIREBASE_APP_ID: z.string(),
					FIREBASE_HOSTING_URL: z.string(),

					AWS_ACCESS_KEY_ID: z.string(),
					AWS_SECRET_ACCESS_KEY: z.string(),
					AWS_REGION: z.string(),
					AWS_HOSTED_ZONE_ID: z.string(),
				}
			: {}),

		OPENAI_API_KEY: z.string().optional(),
		UPLOAD_MAX_FILE_MB: z.coerce.number().default(300),

		POSTMARK_API_KEY: z.string().optional(),
		// SMTP genérico (distribuição open) — alternativa infra-as-code à tela
		// Servidor. A resolução de transporte vive em lib/email-sender.ts.
		SMTP_HOST: z.string().optional(),
		SMTP_PORT: z.coerce.number().int().optional(),
		SMTP_SECURE: z
			.enum(['true', 'false'])
			.transform((value) => value === 'true')
			.optional(),
		SMTP_USER: z.string().optional(),
		SMTP_PASS: z.string().optional(),
		SMTP_FROM: z.string().optional(),

		STRIPE_SECRET_KEY: z.string().optional(),
		STRIPE_PUBLISHABLE_KEY: z.string().optional(),
		STRIPE_WEBHOOK_SECRET: z.string().optional(),
		STRIPE_DEBUG: z.string().default('false'),

		SONAR_TOKEN: z.string().optional(),

		CORE_API_KEY: z.string().min(1),
		ENGINE_URL: z.string(),
		INTEGRATION_URL: z.string(),
		INTERVIEW_BASE_URL: z.string().url(),
		OUTBOX_PUBLISHER_TOPIC: z.string().default('talent-domain-events'),
		OUTBOX_PUBLISHER_BATCH_LIMIT: z.coerce.number().int().positive().default(50),
		OUTBOX_PUBLISHER_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
		...(isSelfHosted() ? selfHostedQueueEnvSchema : {}),
		/**
		 * Empresa que hospeda as vagas-espelho da entrevista de perfil (Dream Jobs).
		 * Não pode ser enterprise — o finish-service não publicaria o resultado no
		 * hunting, que é o propósito do fluxo.
		 */
		PROFILE_INTERVIEW_COMPANY_ID: z.string().optional(),
		/**
		 * Emissão de attestation OTS 0.2 (spec-0.2). A feature só liga com
		 * KEY + ISSUER configurados; sem eles as rotas de emissão respondem 503
		 * com instrução — leitura de status continua funcionando.
		 *
		 * OTS_SIGNING_KEY: chave PRIVADA Ed25519 em PEM PKCS#8 (aceita `\n`
		 * escapado, como a FIREBASE_PRIVATE_KEY). Gerar com:
		 *   openssl genpkey -algorithm ed25519
		 * OTS_ISSUER_BASE_URL: o `iss` dos documentos — a URL pública do core
		 * (ex.: https://api-hml.coploy.io). O JWKS é servido em
		 * {iss}/.well-known/ots/jwks.json, então precisa ser ESTE servidor.
		 */
		OTS_SIGNING_KEY: z.string().optional(),
		OTS_SIGNING_KID: z.string().default('ots-2026-1'),
		// Preprocess: o compose open passa '' quando não configurado, e '' não
		// pode derrubar o boot — vira "feature desligada".
		OTS_ISSUER_BASE_URL: z.preprocess(
			(value) => (value === '' ? undefined : value),
			z.string().url().optional(),
		),
		/**
		 * Portal público de vagas da instalação (open, web/careers). Presente:
		 * o convite de entrevista aponta pra página da vaga no portal (decisão
		 * 1 do martelo 2026-08-23). Ausente (SaaS): link direto da sala.
		 */
		CAREERS_BASE_URL: z.preprocess(
			(value) => (value === '' ? undefined : value),
			z.string().url().optional(),
		),
		/**
		 * Servidor de licenças do plugin Motor  — a instalação da
		 * Coploy que a tela Servidor consulta ao ativar uma chave. Default =
		 * produção; homolog/dev sobrescrevem no compose.
		 */
		MOTOR_LICENSE_SERVER_URL: z.preprocess(
			(value) => (value === '' ? undefined : value),
			z.string().url().default('https://api.coploy.io/core'),
		),
		ORCHESTRATOR_URL: z.string().optional(),
		ADMIN_DASHBOARD_RESET_URL: z.string().url().optional(),
		ADMIN_URL: z.string().url().optional(),
		/**
		 * Área do candidato — destino do pedido de cadastro de perfil.
		 *
		 * Default aponta para produção: o e-mail existe para o candidato
		 * preencher, e mandá-lo para um host inexistente é pior do que não
		 * mandar. Homolog sobrescreve via Terraform.
		 */
		CANDIDATE_APP_URL: z.string().default(''),
		/**
		 * Onde o ATS mora. O link de redefinição de senha aponta para uma tela
		 * DELE, não para a página hospedada do Firebase — e o domínio precisa
		 * estar nos Authorized domains do projeto, senão o Firebase recusa gerar
		 * o link.
		 */
		ATS_APP_URL: z.string().default(''),

		GUPY_CONNECTOR_BASE_URL: z.string().optional(),
		GUPY_CONNECTOR_API_KEY: z.string().optional(),

		BQ_BILLING_PROJECT_ID: z.string().optional(),
		BQ_BILLING_TABLE: z.string().optional(),

		ENCRYPTION_KEY: z.string().min(1).optional(),
	}),
)
