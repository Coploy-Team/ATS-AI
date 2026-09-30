/**
 * Rascunho do formulário longo, no navegador.
 *
 * Criar vaga tem seis passos e o trabalho só existia na memória da aba: um F5
 * na última tela apagava tudo. Um formulário que perde o que a pessoa escreveu
 * não é um formulário incompleto, é um formulário hostil — e a reação natural é
 * não usar mais.
 *
 * Fica no `localStorage` e não no servidor por uma razão de escopo: rascunho
 * salvo no backend vira entidade (quem vê, quem apaga, aparece na listagem?), e
 * o problema aqui é sobreviver a um refresh, não colaborar em rascunhos. Se a
 * necessidade virar essa, o lugar é o servidor — e aí é outra decisão.
 */
const PREFIX = 'coploy.ats.draft.'
/** Rascunho velho é lixo com aparência de trabalho: some depois de um dia. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface Stored<T> {
	savedAt: number
	step: string
	draft: T
}

export function readDraft<T>(key: string): { draft: T; step: string; savedAt: number } | null {
	try {
		const raw = localStorage.getItem(PREFIX + key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Stored<T>
		if (!parsed?.draft || Date.now() - parsed.savedAt > MAX_AGE_MS) {
			localStorage.removeItem(PREFIX + key)
			return null
		}
		return { draft: parsed.draft, step: parsed.step, savedAt: parsed.savedAt }
	} catch {
		// storage cheio, desabilitado ou JSON corrompido: seguir sem rascunho é
		// sempre melhor que quebrar a tela por causa dele
		return null
	}
}

export function writeDraft<T>(key: string, draft: T, step: string): void {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), step, draft }))
	} catch {
		/* sem espaço: o formulário continua funcionando, só não sobrevive ao refresh */
	}
}

export function clearDraft(key: string): void {
	try {
		localStorage.removeItem(PREFIX + key)
	} catch {
		/* nada a fazer — e nada quebra */
	}
}

/** Quanto tempo faz, em palavras. Usado no aviso de rascunho recuperado. */
export function since(savedAt: number, language: string): string {
	const minutes = Math.max(1, Math.round((Date.now() - savedAt) / 60_000))
	const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
	if (minutes < 60) return format.format(-minutes, 'minute')
	return format.format(-Math.round(minutes / 60), 'hour')
}
