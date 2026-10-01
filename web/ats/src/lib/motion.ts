import type { CSSProperties } from 'react'

/**
 * Atraso da cascata: o i-ésimo item entra 60ms depois do anterior, com teto
 * para uma lista de 300 não levar 18 segundos para aparecer inteira.
 */
export function stagger(index: number, stepMs = 60, capMs = 600): CSSProperties {
	return { '--d': `${Math.min(index * stepMs, capMs)}ms` } as CSSProperties
}

/**
 * Contar: anima um número do valor atual até `to` em 700ms, easeOut.
 * Respeita `prefers-reduced-motion` (pula direto para o fim).
 */
export function countUp(
	from: number,
	to: number,
	onFrame: (value: number) => void,
	durationMs = 700,
): () => void {
	if (typeof window === 'undefined') {
		onFrame(to)
		return () => {}
	}
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	if (reduced || from === to) {
		onFrame(to)
		return () => {}
	}
	let raf = 0
	const start = performance.now()
	const tick = (now: number) => {
		const p = Math.min(1, (now - start) / durationMs)
		const eased = 1 - (1 - p) ** 3
		onFrame(Math.round(from + (to - from) * eased))
		if (p < 1) raf = requestAnimationFrame(tick)
	}
	raf = requestAnimationFrame(tick)
	return () => cancelAnimationFrame(raf)
}
