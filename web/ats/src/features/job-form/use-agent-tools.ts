import { useEffect, useRef, useState } from 'react'

import { buildAgentTools, findModelContext, registerTools, webMcpEnabled, type AgentCallDetail } from './agent-tools'
import type { JobDraft } from './job-form-page'

export interface AgentCall {
	tool: string
	step: string
	at: number
	detail?: AgentCallDetail
}

/** Quanto tempo o "preenchendo" fica aceso depois da última chamada. */
const ACTIVITY_MS = 6_000

/**
 * Liga as ferramentas do agente ao formulário enquanto ele está montado.
 *
 * Registra UMA vez por ligar/desligar (não a cada tecla): as ferramentas leem
 * o estado por refs, então o rascunho mais novo é sempre o que o agente vê.
 * Desmontar o formulário desregistra — ferramenta viva numa tela que não
 * existe mais escreveria no vazio.
 */
export function useAgentTools({
	enabled,
	draft,
	setDraft,
	step,
	setStep,
	steps,
	areas,
}: {
	enabled: boolean
	draft: JobDraft
	setDraft: (update: (current: JobDraft) => JobDraft) => void
	step: string
	setStep: (step: string) => void
	steps: readonly string[]
	areas: string[]
}) {
	const latest = useRef({ draft, step, steps, areas })
	latest.current = { draft, step, steps, areas }

	const [registered, setRegistered] = useState(false)
	/** Passo em que o agente acabou de escrever; `null` = parado. */
	const [filling, setFilling] = useState<string | null>(null)
	/** As chamadas desta sessão — o painel "Seu agente" é o log delas. */
	const [calls, setCalls] = useState<AgentCall[]>([])
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const toolsRef = useRef<ReturnType<typeof buildAgentTools> | null>(null)

	useEffect(() => {
		if (!enabled || !webMcpEnabled()) {
			setRegistered(false)
			return
		}
		const ctx = findModelContext()

		const tools = buildAgentTools({
			getDraft: () => latest.current.draft,
			patchDraft: (patch) => setDraft((current) => ({ ...current, ...patch })),
			getStep: () => latest.current.step,
			setStep,
			get steps() {
				return latest.current.steps
			},
			get areas() {
				return latest.current.areas
			},
			onCall: (tool, atStep, detail) => {
				setCalls((current) => [...current.slice(-29), { tool, step: atStep, at: Date.now(), detail }])
				setFilling(atStep)
				if (timer.current) clearTimeout(timer.current)
				timer.current = setTimeout(() => setFilling(null), ACTIVITY_MS)
			},
		})

		// as ferramentas existem mesmo sem navegador que as exponha: é o que
		// permite a demonstração rodar pelo MESMO caminho que o agente real
		toolsRef.current = tools
		let off: () => void = () => undefined
		if (ctx) {
			try {
				off = registerTools(ctx, tools)
				setRegistered(true)
			} catch {
				setRegistered(false)
			}
		} else {
			setRegistered(false)
		}
		return () => {
			toolsRef.current = null
			off()
			if (timer.current) clearTimeout(timer.current)
			setRegistered(false)
			setFilling(null)
		}
		// setDraft/setStep são estáveis (useState); o resto é lido por ref
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled])

	return { registered, filling, calls }
}
