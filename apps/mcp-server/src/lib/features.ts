import { env } from '@/env'

/**
 * O que esta instalação tem — decidido pela configuração, não por edição.
 *
 * No SaaS da Coploy tudo existe. Numa instalação open, o Motor é plugin
 * (pode não estar) e a área do candidato não faz parte da distribuição. As
 * tools não somem: respondem "esta instalação não tem isto", porque o
 * assistente precisa saber o motivo para não inventar um.
 */
export interface InstallationFeatures {
	/** Há sala de entrevista para mandar o candidato (Motor instalado). */
	motor: boolean
	/** Há área do candidato para onde apontar (upload do currículo). */
	candidateApp: boolean
}

export function installationFeatures(): InstallationFeatures {
	return {
		motor: Boolean(env.INTERVIEW_BASE_URL),
		candidateApp: Boolean(env.CANDIDATE_APP_URL),
	}
}
