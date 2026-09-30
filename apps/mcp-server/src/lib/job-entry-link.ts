import { env } from '@/env'

/**
 * Para onde a vaga leva o candidato.
 *
 * Com o Motor: a sala de entrevista (mesmo formato do gupy-connector). Sem
 * ele: a página da vaga no portal público da instância, onde a candidatura
 * acontece sem entrevista. Sem nenhum dos dois, não há link — e a tool diz
 * isso em vez de montar um endereço que responde 404.
 */
export function jobEntryUrl(jobId: string, companyId: string): string | null {
	if (env.INTERVIEW_BASE_URL) {
		return `${env.INTERVIEW_BASE_URL.replace(/\/+$/, '')}/job/${jobId}/company/${companyId}/login`
	}
	if (env.CAREERS_BASE_URL) {
		return `${env.CAREERS_BASE_URL.replace(/\/+$/, '')}/${companyId}/vagas/${jobId}`
	}
	return null
}
