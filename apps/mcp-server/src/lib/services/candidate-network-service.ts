import type { InfraProvider } from '@coploy/infra'

import * as coreClient from '@/lib/core-client'
import { env } from '@/env'
import { createCandidateAuthService } from './candidate-auth-service'

/**
 * A rede do candidato no canal MCP (COP-22 / COP-12): projetos, perfil aberto,
 * vitrine por link, prova verificada (OTS) e portabilidade.
 *
 * Regra igual à do currículo: nada de lógica aqui. Cada método autentica como
 * o candidato e chama a MESMA rota que a área do candidato chama — por isso
 * publicar pelo assistente passa pela mesma curadoria (COP-14) e pelo mesmo
 * consentimento da tela. Não existe atalho por ser MCP.
 */

export type CoreResult<T> = Awaited<ReturnType<typeof coreClient.getPublicProfile>> extends infer R
	? R extends { ok: true } ? { ok: true; data: T } : R
	: never

/**
 * O que o candidato aceita ao publicar no perfil aberto — o assistente lê isto
 * PARA a pessoa antes de chamar a tool com `accepted: true`. É a versão
 * vigente no core (`consentVersion`) que carimba o aceite; o texto é o resumo
 * do que a área do candidato mostra no diálogo de consentimento.
 */
export const PUBLIC_PROFILE_CONSENT_SUMMARY = {
	'pt-BR':
		'Ao publicar, este item passa a aparecer na sua página pública (@seu-nome), visível a qualquer pessoa com o link ' +
		'e sem identificar a empresa de nenhum processo. Nada vai ao ar antes da análise de curadoria (legalidade, não ' +
		'qualidade); o que ela marcar é revisado por uma pessoa. Você pode tirar do ar item a item, ou revogar tudo, quando quiser.',
	en:
		'When published, this item appears on your public page (@your-name), visible to anyone with the link and without ' +
		'naming the company of any process. Nothing goes live before the curation check (legality, not quality); whatever ' +
		'it flags is reviewed by a person. You can take items down one by one, or revoke everything, at any time.',
} as const

export const SHOWCASE_CONSENT_SUMMARY = {
	'pt-BR':
		'A vitrine é um link opaco, só para quem o receber: os vídeos escolhidos, sem nota, sem veredito e sem o nome da ' +
		'empresa do processo. Trocar a seleção preserva o link; revogar é permanente e emite outro se publicar de novo.',
	en:
		'The showcase is an opaque link, only for whoever receives it: the chosen videos, with no score, no verdict and no ' +
		'company name. Changing the selection keeps the link; revoking is permanent and a new link is issued if you publish again.',
} as const

export const ATTESTATION_CONSENT_SUMMARY = {
	'pt-BR':
		'A prova verificada é um documento assinado pela Coploy sobre uma entrevista concluída, que outra empresa pode conferir ' +
		'sem falar conosco. Você escolhe o quanto ela conta (existence: só que houve; summary: o resumo; full: o resultado ' +
		'inteiro) e por quanto tempo vale (padrão 2 anos). Revogar é seu direito e é permanente.',
	en:
		'A verified attestation is a document signed by Coploy about a finished interview, which another company can check ' +
		'without contacting us. You choose how much it discloses (existence: only that it happened; summary; full) and ' +
		'for how long it is valid (default 2 years). Revoking is your right and is permanent.',
} as const

export function createCandidateNetworkService(infra: InfraProvider) {
	const candidateAuthService = createCandidateAuthService(infra)
	const tokenFor = (uid: string) => candidateAuthService.mintUserIdToken(uid)
	const candidateApp = (env.CANDIDATE_APP_URL ?? '').replace(/\/$/, '')

	return {
		publicUrlFor(handle: string | null): string | null {
			return handle && candidateApp ? `${candidateApp}/@${handle}` : null
		},

		// ─── projetos ───────────────────────────────────────────────────
		async listProjects(uid: string) {
			return coreClient.listProjects(await tokenFor(uid))
		},
		async createProject(uid: string, body: Record<string, unknown>) {
			return coreClient.createProject(await tokenFor(uid), body)
		},
		async updateProject(uid: string, id: string, body: Record<string, unknown>) {
			return coreClient.updateProject(await tokenFor(uid), id, body)
		},
		async deleteProject(uid: string, id: string) {
			return coreClient.deleteProject(await tokenFor(uid), id)
		},
		async reorderProjects(uid: string, ids: string[]) {
			return coreClient.reorderProjects(await tokenFor(uid), ids)
		},

		// ─── perfil aberto ──────────────────────────────────────────────
		async getPublicProfile(uid: string) {
			return coreClient.getPublicProfile(await tokenFor(uid))
		},
		async checkHandle(uid: string, handle: string) {
			return coreClient.checkPublicProfileHandle(await tokenFor(uid), handle)
		},
		async setHandle(uid: string, handle: string) {
			return coreClient.setPublicProfileHandle(await tokenFor(uid), handle)
		},
		async setAvailability(uid: string, availability: coreClient.PublicProfile['availability']) {
			return coreClient.setPublicProfileAvailability(await tokenFor(uid), availability)
		},
		async publishItem(uid: string, body: Record<string, unknown>) {
			const token = await tokenFor(uid)
			// a versão do consentimento é a que o core diz ser vigente — o canal não crava versão
			const current = await coreClient.getPublicProfile(token)
			if (!current.ok) return current
			return coreClient.publishPublicProfileItem(token, { ...body, accepted: true, consentVersion: current.data.consentVersion })
		},
		async removeItem(uid: string, itemId: string) {
			return coreClient.removePublicProfileItem(await tokenFor(uid), itemId)
		},
		async revokePublicProfile(uid: string) {
			return coreClient.revokePublicProfile(await tokenFor(uid))
		},

		// ─── vitrine por link ───────────────────────────────────────────
		async getShowcase(uid: string) {
			return coreClient.getMyShowcase(await tokenFor(uid))
		},
		async listAnswers(uid: string, jobAppliedId: string) {
			return coreClient.listInterviewAnswers(await tokenFor(uid), jobAppliedId)
		},
		async publishShowcase(uid: string, body: Parameters<typeof coreClient.publishShowcase>[1]) {
			return coreClient.publishShowcase(await tokenFor(uid), body)
		},
		async revokeShowcase(uid: string) {
			return coreClient.revokeShowcase(await tokenFor(uid))
		},

		// ─── prova verificada (OTS) e portabilidade ─────────────────────
		async listAttestations(uid: string) {
			return coreClient.listAttestations(await tokenFor(uid))
		},
		async issueAttestation(uid: string, body: Parameters<typeof coreClient.issueAttestation>[1]) {
			return coreClient.issueAttestation(await tokenFor(uid), body)
		},
		async revokeAttestation(uid: string, jti: string) {
			return coreClient.revokeAttestation(await tokenFor(uid), jti)
		},
		async exportProfile(uid: string) {
			return coreClient.exportProfile(await tokenFor(uid))
		},
	}
}

export type CandidateNetworkService = ReturnType<typeof createCandidateNetworkService>
