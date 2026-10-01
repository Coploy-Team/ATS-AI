import { Navigate } from '@tanstack/react-router'
import { createElement } from 'react'

/**
 * Stub do espelho público.
 *
 * No monorepo da Coploy este arquivo é a porta única para as superfícies do
 * SaaS hospedado — cobrança (créditos, catálogo, desbloqueio de candidato) e
 * a integração com a Gupy. Nada disso faz parte da distribuição open: o
 * servidor aberto não tem essas rotas, e os arquivos que as consumiam não
 * existem nesta árvore. O build do clone é a prova: importar um deles por
 * fora deste agregador quebra a compilação, nunca falha em silêncio.
 *
 * A interface já decide o que aparece por `features.billing` e
 * `features.integrations` (ambos falsos nesta edição); os stubs existem para
 * o link direto e o import continuarem válidos.
 */

/** Sem cobrança não há saldo a mostrar. */
export function useBillingUsage(_enabled: boolean): { creditsTotal: number | undefined } {
	return { creditsTotal: undefined }
}

/** Tela de Créditos não existe nesta edição: link direto volta ao painel. */
export function CreditsPage() {
	return createElement(Navigate, { to: '/dashboard', replace: true })
}

/** O dossiê nunca vem bloqueado sem cobrança; o card não tem o que fazer. */
export function UnlockCard(_props: { jobId: string; candidateId: string; jobAppliedId: string }) {
	return null
}

export function GupyForm() {
	return null
}

export function GupyDocs() {
	return null
}
