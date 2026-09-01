import type { InterviewHandoff } from '@coploy/domain'

export interface InterviewHandoffRepository {
	/** Emite um ticket de handoff para `userId`, válido até `expiresAt`. */
	createHandoff(code: string, userId: string, expiresAt: Date): Promise<void>
	/**
	 * Resgata o ticket **atomicamente**: só a primeira chamada com um código
	 * válido e não expirado devolve o handoff; qualquer chamada seguinte (ou
	 * concorrente) devolve null. É o que garante o uso único mesmo com corrida.
	 */
	consumeHandoff(code: string): Promise<InterviewHandoff | null>
}
