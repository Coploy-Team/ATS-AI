import { setMotorVocabulary } from '@/features/jobs/stages'
import { empresa } from '@coploy/sdk/react'

import { lembrarPapel } from '@/lib/guest'

/**
 * O que este usuário pode fazer (V2-301).
 *
 * A mesma matriz que o backend usa — a tela não recalcula regra, ela pergunta.
 * Botão que o servidor negaria não deve nem aparecer: erro depois do clique é
 * pior que ausência antes dele.
 *
 * ⚠️ Enquanto o RBAC roda em shadow (`enforcing: false`), o backend não bloqueia
 * nada. A tela ainda assim esconde o que o papel não permite — é o que permite
 * ver como o produto fica ANTES de virar a chave, e sem esconder nada de quem
 * hoje é `owner` por ausência de papel (a maioria da base).
 */
/**
 * O que esta INSTALAÇÃO oferece (ADR-007) — a diferença entre edições:
 * SaaS/enterprise Coploy tem tudo; a distribuição open não tem hunting nem
 * billing, e o Motor de entrevista só existe quando o plugin é instalado.
 */
export interface InstallationFeatures {
	motor: boolean
	hunting: boolean
	billing: boolean
	/** Aba Integrações (Gupy/webhooks) — superfície do SaaS; open não tem. */
	integrations: boolean
	/** Tela Servidor (SMTP, plugin) — só a distribuição open tem. */
	instanceConfig: boolean
}

const FEATURES_KEY = 'coploy.ats.features'

/**
 * Última resposta conhecida, para decidir ANTES da chamada voltar.
 *
 * Default sem memória = tudo ligado (o SaaS é a edição majoritária). Na
 * distribuição open isso mostraria Hunting/Créditos por meio segundo na
 * PRIMEIRA visita — a memória existe pra isso acontecer uma vez só, não a
 * cada refresh (o flicker de menu por plano foi bug real no dashboard v1).
 */
function featuresLembradas(): InstallationFeatures {
	try {
		const bruto = localStorage.getItem(FEATURES_KEY)
		// merge com o default: memória gravada antes de uma flag nova existir
		// não pode esconder a superfície nova no SaaS até a resposta chegar
		if (bruto)
			return {
				motor: true,
				hunting: true,
				billing: true,
				integrations: true,
				instanceConfig: false,
				...(JSON.parse(bruto) as Partial<InstallationFeatures>),
			}
	} catch {
		/* localStorage indisponível — segue o default */
	}
	return { motor: true, hunting: true, billing: true, integrations: true, instanceConfig: false }
}

function lembrarFeatures(features: InstallationFeatures) {
	setMotorVocabulary(features.motor)
	try {
		localStorage.setItem(FEATURES_KEY, JSON.stringify(features))
	} catch {
		/* sem persistência o custo é só o flash da primeira visita */
	}
}

export function useCapabilities() {
	const { data, isLoading } = empresa.useGetCompaniesCapabilities()
	const payload = data?.data as
		| {
				role?: string
				capabilities?: string[]
				enforcing?: boolean
				features?: InstallationFeatures
		  }
		| undefined

	const list = payload?.capabilities ?? []

	// guarda o papel para o roteador decidir antes de renderizar (ver `guest.ts`)
	if (payload?.role) lembrarPapel(payload.role)
	if (payload?.features) lembrarFeatures(payload.features)

	return {
		role: payload?.role ?? 'owner',
		enforcing: payload?.enforcing === true,
		isLoading,
		/**
		 * Durante o carregamento devolve `true`: esconder a ação por meio segundo
		 * e trazê-la de volta pisca a interface e faz o usuário duvidar do que viu.
		 */
		can: (capability: string) => (isLoading ? true : list.includes(capability)),
		features: payload?.features ?? featuresLembradas(),
	}
}
