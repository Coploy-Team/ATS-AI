import * as coreClient from '@/lib/core-client'

/**
 * Anexa um ticket de handoff ao link da entrevista, pra o candidato entrar já
 * autenticado em vez de digitar senha de novo.
 *
 * Só deve ser usado nas tools de **ação** (o momento em que a pessoa vai abrir
 * a entrevista) — nunca em listagens, que gerariam um ticket por item a cada
 * leitura. O ticket é de uso único e vida curta; se a emissão falhar, o link
 * volta sem ele e o fluxo continua pedindo login (degradação limpa).
 */
export async function withInterviewHandoff(interviewUrl: string, userToken: string): Promise<string> {
	const handoff = await coreClient.issueInterviewHandoff(userToken).catch(() => null)
	if (!handoff?.ok) return interviewUrl

	const url = new URL(interviewUrl)
	url.searchParams.set('handoff', handoff.data.code)
	return url.toString()
}
