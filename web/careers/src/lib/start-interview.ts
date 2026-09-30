import { candidato } from '@coploy/sdk'

/**
 * Abre a sala de entrevista JÁ AUTENTICADO (decisão 1 do martelo 2026-08-23):
 * o portal é a única porta — a sala nunca pede um segundo login.
 *
 * O mecanismo é o handoff de uso único que já existe no produto (o mesmo dos
 * canais externos): emite o bilhete com a sessão do candidato e o anexa ao
 * link. Se a emissão falhar (sessão vencida, rede), o link abre sem bilhete e
 * a sala pede login — degradação, nunca bloqueio.
 */
export async function startInterview(interviewUrl: string): Promise<void> {
	let url = interviewUrl
	try {
		const response = await candidato.postDreamJobsInterviewHandoff()
		if (response.status === 201 && response.data.code) {
			const separator = interviewUrl.includes('?') ? '&' : '?'
			url = `${interviewUrl}${separator}handoff=${encodeURIComponent(response.data.code)}&src=careers`
		}
	} catch {
		// segue sem bilhete — a sala pede login
	}
	window.location.href = url
}
