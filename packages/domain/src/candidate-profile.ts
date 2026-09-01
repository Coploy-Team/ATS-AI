/**
 * Currículo vivo do candidato.
 *
 * É o ativo central do fluxo de candidato: o que o torna encontrável no
 * hunting. Alimentado por várias fontes — conversa no plugin (ChatGPT/Claude),
 * área do candidato, upload de currículo e LinkedIn — e por isso guarda a
 * origem de cada campo, para uma fonte automática não sobrescrever em silêncio
 * o que a pessoa escreveu à mão.
 *
 * Fonte de verdade: coleção `candidateProfiles` (GCP) / tabela
 * `candidate_profiles` (selfhosted). O documento `users/{uid}` mantém um
 * ESPELHO de `occupation`, `countryOfResidence` e `countriesOfInterest`,
 * porque hunting, VIEWs e projeções (`public_interviews`, `companyInterviews`)
 * já leem de lá — espelhar evita regressão nessas rotas críticas.
 */

/** De onde veio o dado — usado para resolver conflito entre fontes. */
export type CandidateProfileSource =
	| 'chat'
	| 'dashboard'
	| 'resume'
	| 'linkedin'
	| 'interview'

export interface CandidateExperience {
	id?: string | null
	title?: string | null
	company?: string | null
	location?: string | null
	/** AAAA-MM (mês é a granularidade útil em currículo). */
	startDate?: string | null
	/** null quando é o emprego atual. */
	endDate?: string | null
	current?: boolean | null
	description?: string | null
	skills?: string[] | null
}

export interface CandidateEducation {
	id?: string | null
	institution?: string | null
	degree?: string | null
	fieldOfStudy?: string | null
	startDate?: string | null
	endDate?: string | null
	current?: boolean | null
	description?: string | null
}

export type LanguageProficiency = 'basic' | 'intermediate' | 'advanced' | 'fluent' | 'native'

export interface CandidateLanguage {
	language?: string | null
	proficiency?: LanguageProficiency | null
}

export interface CandidateCertification {
	id?: string | null
	name?: string | null
	issuer?: string | null
	issueDate?: string | null
	expirationDate?: string | null
	credentialUrl?: string | null
}

export interface CandidateProfile {
	/**
	 * Ocupação canônica (V2-803), resolvida do texto de `occupation`. Convive
	 * com ele: o que a pessoa escreveu continua sendo o que a tela mostra.
	 */
	occupationCode?: string | null
	taxonomyVersion?: string | null

	/** Mesmo id do usuário (uid). */
	id: string

	// ── Identidade (espelhada de users/{uid} na leitura; não é fonte aqui) ──
	name?: string | null
	email?: string | null
	phone?: string | null
	photoUrl?: string | null
	/**
	 * CPF opcional (Talent OS F0.2). Alimenta a camada `pessoa` via hook no
	 * candidate-profile-service. Dado sensível: NÃO logar em claro e NÃO
	 * devolver em respostas de API (o service stripa na saída).
	 */
	cpf?: string | null

	// ── Apresentação ──
	/** Uma linha, estilo LinkedIn: "Full Stack Developer | Node, React, AWS". */
	headline?: string | null
	summary?: string | null

	// ── Profissional ──
	/**
	 * Cargo/profissão. Nome alinhado ao que hunting e projeções já usam
	 * (`users.occupation`, `public_interviews.occupation`). Docs legados
	 * gravados pelo fluxo antigo usam `profession` — o service normaliza.
	 */
	occupation?: string | null
	/** @deprecated Alias legado de `occupation`. Ler via service, não direto. */
	profession?: string | null
	level?: string | null
	yearsOfExperience?: number | null
	professionalObjectives?: string | null
	/** Empresa atual — atalho de leitura; a série completa vive em `experiences`. */
	company?: string | null

	// ── Localização e mobilidade (usadas pelo filtro de país do hunting) ──
	location?: string | null
	countryOfResidence?: string | null
	countriesOfInterest?: string[] | null

	// ── Currículo ──
	skills?: string[] | null
	experiences?: CandidateExperience[] | null
	education?: CandidateEducation[] | null
	languages?: CandidateLanguage[] | null
	certifications?: CandidateCertification[] | null

	// ── Fontes externas ──
	resumeUrl?: string | null
	linkedinUrl?: string | null

	// ── Metadados ──
	/** 0–100, calculado pelo service — orienta o candidato sobre o que falta. */
	completeness?: number | null
	/** Origem por campo, ex: { summary: 'chat', skills: 'linkedin' }. */
	fieldSources?: Record<string, CandidateProfileSource> | null
	createdAt?: Date | null
	updatedAt?: Date | null
}
