import { isSelfHosted } from '@coploy/shared/env'

import { env } from '@/env'

/**
 * O que ESTA instalação oferece — a diferença entre as edições :
 *
 * - **SaaS / enterprise Coploy**: tudo ligado. Hunting e créditos são o
 *   produto; o Motor vem embutido.
 * - **Distribuição open**: hunting e billing NUNCA existem (decisão 4 do
 *   ADR-007 — hunting é efeito de rede do SaaS, crédito não faz sentido
 *   self-hosted) e o Motor só liga quando o plugin é instalado
 *   (`MOTOR_ENABLED=true` + MOTOR_* URLs no compose).
 *
 * É informação de instalação, não de usuário — mas desce junto das
 * capabilities porque a UI decide as duas coisas no mesmo lugar: o que este
 * usuário pode E o que esta edição tem. Menu que leva a tela vazia é tão ruim
 * quanto botão que o RBAC vai negar.
 */
export interface InstallationFeatures {
	/** Motor de entrevista por IA presente (embutido no SaaS, plugin no open). */
	motor: boolean
	/** Pool público de talentos — efeito de rede exclusivo do SaaS. */
	hunting: boolean
	/** Créditos/assinatura — modelo comercial do SaaS. */
	billing: boolean
	/**
	 * Aba Integrações (Gupy, result webhooks, API docs) — superfície do SaaS
	 * hospedado. Na open não faz sentido (decisão do Henrique, 2026-08-22):
	 * quem tem o código integra por fora, e as rotas de Gupy nem existem no
	 * core aberto desde o recorte do espelho.
	 */
	integrations: boolean
	/**
	 * Tela Servidor (SMTP, plugin) — configuração da INSTALAÇÃO, exclusiva da
	 * distribuição open: no SaaS quem opera o servidor é a Coploy.
	 */
	instanceConfig: boolean
	/**
	 * Canal de entrevista por WhatsApp. É SaaS e só: o app que atende o webhook
	 * (`apps/whatsapp-interview`) não vai no espelho público NEM no plugin
	 * Motor — e ainda que fosse, o canal depende de número verificado e app
	 * Meta que pertencem à Coploy. Sem esta flag a v2 ofereceria um modo de
	 * entrevista que nada atende do outro lado.
	 */
	whatsapp: boolean
}

export function getInstallationFeatures(): InstallationFeatures {
	if (!isSelfHosted()) {
		return {
			motor: true,
			hunting: true,
			billing: true,
			integrations: true,
			instanceConfig: false,
			whatsapp: true,
		}
	}
	return {
		motor: (env as { MOTOR_ENABLED?: boolean }).MOTOR_ENABLED === true,
		hunting: false,
		billing: false,
		integrations: false,
		instanceConfig: true,
		whatsapp: false,
	}
}
