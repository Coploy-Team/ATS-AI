/**
 * Catálogo versionado C1–C18 (TOS-007 / F0.3).
 *
 * Fonte de verdade para validação de `featureCode` no Credits Service.
 * Preços: NÃO inventar. Onde o discovery/blueprint não documenta valor,
 * `amountCredits: null` (indefinido) — nunca `0` como placeholder
 * (`0` = grátis; `null` = ainda não confirmado).
 *
 * ⚠️ SUSPENSO — não é o modelo de cobrança vigente (decisão de 16/08/2026,
 * `docs/decisions.md`). O produto cobra de duas formas, nenhuma delas por
 * execução de entrevista:
 *
 *   Enterprise — contrato mensal negociado (`EnterpriseContract`), sem bloqueio.
 *   SaaS       — crédito por VISUALIZAÇÃO de candidato (`view_candidate`);
 *                criar e enviar entrevista é ilimitado.
 *
 * Este catálogo modela cobrança por execução (`reserve → capture`) e fica como
 * preparação do F4+ do roadmap. Os `null` NÃO são dívida esperando preço: são a
 * ausência correta enquanto o modelo não for usado. Cobrar por entrevista
 * executada contradiz o "entrevistas ilimitadas" anunciado em coploy.io.
 */

export type TalentCreditsCatalogEntry = {
	code: string
	name: string
	description: string
	/** Módulo Talent OS (F2, F4, …) — metadado de produto, não preço. */
	module: string
	/**
	 * Custo em créditos. null = indefinido no blueprint.
	 * Nunca usar 0 como placeholder de “ainda não sabemos”.
	 */
	amountCredits: number | null
}

export const TALENT_CREDITS_CATALOG: readonly TalentCreditsCatalogEntry[] = [
	{
		code: 'C1',
		name: 'Entrevista Coploy (vídeo)',
		description:
			'F4 Motor — execução/convite entrevista vídeo. NÃO é candidate_interview (unlock SaaS).',
		module: 'F4',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C2',
		name: 'Entrevista Coploy (WhatsApp/áudio)',
		description: 'F4 Motor — execução/convite entrevista WhatsApp/áudio.',
		module: 'F4',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C3',
		name: 'Verificação de identidade / etapa Motor',
		description: 'F4 Motor — citado com C1–C3 como 1ª receita do Motor Coploy.',
		module: 'F4',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C4',
		name: 'Assessment / teste',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C5',
		name: 'Assessment / teste (variante)',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C6',
		name: 'Talent Intel / sourcing',
		description: 'F11 Talent Intel — sourcing + portal.',
		module: 'F11',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C7',
		name: 'Talent Intel / rediscovery',
		description: 'F11 Talent Intel.',
		module: 'F11',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C8',
		name: 'Talent Intel / CRM passivo',
		description: 'F11 Talent Intel.',
		module: 'F11',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C9',
		name: 'Assessment / D&I',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C10',
		name: 'Assessment / interno',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C11',
		name: 'Oferta / proposta',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C12',
		name: 'Admissão digital',
		description: 'F6 Admissão→ERP.',
		module: 'F6',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C13',
		name: 'Admissão / integração ERP',
		description: 'F6 Admissão→ERP.',
		module: 'F6',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C14',
		name: 'Assessment / oferta (variante)',
		description: 'F5 Assessments/Oferta.',
		module: 'F5',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C15',
		name: 'Analytics / benchmark',
		description: 'F12 Analytics.',
		module: 'F12',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C16',
		name: 'Certificação LMS',
		description: 'F10 LMS — certificação verificável.',
		module: 'F10',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C17',
		name: 'ATS / Notification Hub',
		description: 'F2 ATS + F0.4 Notification Hub — monetização ATS / notificação.',
		module: 'F2',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
	{
		code: 'C18',
		name: 'ATS / impulsionamento',
		description: 'F2 ATS — impulsionamento de vaga.',
		module: 'F2',
		// TODO(dev): confirmar código/preço no blueprint v3.0
		amountCredits: null,
	},
] as const

const BY_CODE = new Map(TALENT_CREDITS_CATALOG.map((item) => [item.code, item]))

export function getTalentCreditsCatalogEntry(
	code: string,
): TalentCreditsCatalogEntry | undefined {
	return BY_CODE.get(code)
}

export function isKnownTalentFeatureCode(code: string): boolean {
	return BY_CODE.has(code)
}

/** Códigos ainda sem preço no blueprint (amountCredits === null). */
export function listUnpricedTalentCatalogCodes(): string[] {
	return TALENT_CREDITS_CATALOG.filter((c) => c.amountCredits === null).map((c) => c.code)
}

/** Shape persistido no repo (domain usa unitCostCredits). */
export function toCatalogSeedItems() {
	return TALENT_CREDITS_CATALOG.map((item) => ({
		code: item.code,
		name: item.name,
		description: `[${item.module}] ${item.description}`,
		unitCostCredits: item.amountCredits,
		active: true as const,
	}))
}
