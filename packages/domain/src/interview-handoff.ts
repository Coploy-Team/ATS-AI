/**
 * Código de handoff de sessão: permite abrir a entrevista já autenticado a
 * partir de um canal externo (plugin ChatGPT/Claude), sem o candidato digitar
 * senha de novo.
 *
 * Segurança: o link viaja por uma conversa que pode ser compartilhada ou ficar
 * no histórico, então o código NÃO é credencial — é um ticket opaco,
 * de vida curta e **uso único**, trocado por um token de sessão no primeiro
 * resgate. Depois disso o mesmo link não vale mais nada.
 */
export interface InterviewHandoff {
	id: string
	/** Dono do ticket — para quem a sessão será emitida no resgate. */
	userId?: string | null
	createdAt?: Date | null
	expiresAt?: Date | null
	/** Preenchido no resgate; presença marca o código como queimado. */
	usedAt?: Date | null
}
