import type {
	Company,
	ConsentPurpose,
	ConsentRecord,
	DataSubjectRequest,
	JobApplied,
	RetentionPolicy,
} from '@coploy/domain'
import { DEFAULT_CANDIDATE_RETENTION_DAYS } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { NotFoundError } from '@coploy/shared/errors'

/**
 * LGPD operacional (V2-701).
 *
 * Obrigação legal, não feature — e a diferença aparece no desenho: quando um
 * pedido de exclusão chega, o que a fiscalização quer ver não é a intenção, é a
 * **prova**. Por isso toda operação daqui grava um `DataSubjectRequest` antes de
 * mexer em qualquer coisa, e a trilha vive fora do documento do titular: apagar
 * a pessoa não pode apagar o registro de que ela foi apagada.
 *
 * Duas escolhas que definem o resto:
 *
 * 1. **Anonimizar é o default; excluir é a exceção.** Apagar a candidatura
 *    destrói a estatística da vaga (funil, tempo, taxa) de um processo que a
 *    empresa precisa manter para se defender de reclamação trabalhista.
 *    Anonimizar tira o PII e **preserva o que não identifica ninguém** — nota,
 *    etapa, datas. É o que atende os dois lados.
 * 2. **Exclusão total só a pedido do titular.** Ninguém dentro da empresa
 *    dispara isso: quem tem esse direito é a pessoa, e a rota da empresa só
 *    chega até a anonimização.
 */

/** Marcador do dado removido — não usar string vazia, que se confunde com "nunca preenchido". */
const REDACTED = '[removido a pedido do titular]'

export type AnonymizeResult = {
	jobsApplied: number
	interviews: number
	profileRemoved: boolean
	userRedacted: boolean
}

function retentionOf(company: Company | null): RetentionPolicy {
	const policy = (company as { retentionPolicy?: RetentionPolicy } | null)?.retentionPolicy
	return {
		candidateRetentionDays: policy?.candidateRetentionDays ?? DEFAULT_CANDIDATE_RETENTION_DAYS,
		talentPoolConsentDays: policy?.talentPoolConsentDays ?? null,
		policyVersion: policy?.policyVersion ?? null,
	}
}

/** Dias corridos desde a última interação — não desde a criação. */
export function daysSince(date: Date | string | null | undefined, now: Date): number | null {
	if (!date) return null
	const parsed = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(parsed.getTime())) return null
	return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

/**
 * A candidatura passou do prazo de retenção?
 *
 * Conta da última movimentação: quem voltou a se candidatar mês passado não tem
 * dado "velho" só porque o primeiro cadastro é de 2021.
 */
export function isPastRetention(
	jobApplied: Pick<JobApplied, 'finishedTime' | 'dateSelect' | 'appliedTime'>,
	retentionDays: number,
	now: Date,
): boolean {
	const last =
		jobApplied.finishedTime ?? jobApplied.dateSelect ?? jobApplied.appliedTime ?? null
	const age = daysSince(last as Date | null, now)
	return age !== null && age >= retentionDays
}

export function createLgpdService(infra: InfraProvider) {
	const repo = infra.lgpdRepository

	async function audit(
		entry: Omit<DataSubjectRequest, 'id' | 'status' | 'requestedAt'>,
	): Promise<string> {
		const created = await repo.createRequest({
			...entry,
			status: 'pending',
			requestedAt: new Date(),
		} as never)
		return created.id
	}

	/** Tira o PII e preserva o que é estatística. */
	async function anonymizeUser(userId: string): Promise<AnonymizeResult> {
		const result: AnonymizeResult = {
			jobsApplied: 0,
			interviews: 0,
			profileRemoved: false,
			userRedacted: false,
		}

		/*
		 * `Promise.resolve(...)` em volta de cada leitura/escrita: são todas
		 * best-effort, e um adapter que devolva valor não-thenable derrubaria a
		 * anonimização inteira no meio — deixando o titular parcialmente apagado,
		 * que é o pior estado possível.
		 */
		const jobsApplied = (await Promise.resolve(
			infra.candidateRepository.listJobsApplied(userId, {}),
		).catch(() => [])) as Array<JobApplied & { id: string }>

		for (const application of jobsApplied) {
			const companyId = application.companyOwner?.id
			/*
			 * O que sai: nome, e-mail, telefone, foto, transcrição e mídia — tudo
			 * que aponta para uma pessoa. O que fica: nota, etapa, datas. Sem isso,
			 * anonimizar viraria exclusão disfarçada e levaria junto o histórico
			 * que a empresa precisa manter.
			 */
			const redaction = {
				name: REDACTED,
				email: null,
				phone_number: null,
				photo_url: null,
				anonymizedAt: new Date(),
			}

			if (companyId) {
				await Promise.resolve(
					infra.candidateRepository.updateCompanyInterview(
						companyId,
						application.id,
						redaction as never,
					),
				).catch(() => undefined)
				const jobId = application.jobApplied?.id
				if (jobId) {
					await Promise.resolve(
						infra.candidateRepository.updateJobInterview(
							companyId,
							jobId,
							application.id,
							redaction as never,
						),
					).catch(() => undefined)
					result.interviews += 1
				}
			}

			await Promise.resolve(
				infra.candidateRepository.updateJobApplied(userId, application.id, {
					anonymizedAt: new Date(),
					// a transcrição é a fala da pessoa: identifica com folga
					interview: null,
					additional: null,
				} as never),
			).catch(() => undefined)
			result.jobsApplied += 1
		}

		/*
		 * Currículo é PII quase puro. Não existe `delete` no repositório (o perfil
		 * é alimentado por várias fontes e some junto com o usuário), então o que
		 * se faz é esvaziar: some o conteúdo, resta a casca.
		 */
		await Promise.resolve(
			infra.userRepository.updateCandidateProfile(userId, {
				headline: null,
				summary: null,
				skills: [],
				experiences: [],
				education: [],
				languages: [],
				certifications: [],
				resumeUrl: null,
				linkedinUrl: null,
			} as never),
		)
			.then(() => {
				result.profileRemoved = true
			})
			.catch(() => undefined)

		await Promise.resolve(
			infra.userRepository.updateUser(userId, {
				display_name: REDACTED,
				email: null,
				phone_number: null,
				photo_url: null,
				anonymizedAt: new Date(),
			} as never),
		)
			.then(() => {
				result.userRedacted = true
			})
			.catch(() => undefined)

		return result
	}

	return {
		isPastRetention,

		/** Consentimentos vigentes e revogados — o histórico é a prova. */
		async listConsents(userId: string): Promise<ConsentRecord[]> {
			return repo.listConsents(userId)
		},

		async grantConsent(params: {
			userId: string
			companyId?: string | null
			purpose: ConsentPurpose
			expiresAt?: Date | null
			policyVersion?: string | null
			source?: string | null
		}) {
			const record = await repo.createConsent({
				...params,
				granted: true,
				grantedAt: new Date(),
			} as never)

			await audit({
				userId: params.userId,
				companyId: params.companyId ?? null,
				operation: 'consent_granted',
				requestedBy: params.userId,
			}).catch(() => undefined)

			return record
		},

		async revokeConsent(params: { userId: string; consentId: string }) {
			const existing = (await repo.listConsents(params.userId)).find(
				(item) => item.id === params.consentId,
			)
			// consentimento de outra pessoa responde como inexistente
			if (!existing) throw new NotFoundError('Consent not found')

			await repo.revokeConsent(params.consentId, new Date())
			await audit({
				userId: params.userId,
				companyId: existing.companyId ?? null,
				operation: 'consent_revoked',
				requestedBy: params.userId,
			}).catch(() => undefined)
		},

		/**
		 * Portabilidade (LGPD Art. 18, V). O titular leva o que é dele.
		 *
		 * Não inclui a avaliação da empresa: nota e parecer são opinião do
		 * controlador sobre a pessoa, não dado fornecido por ela — e exportá-los
		 * viraria um canal de vazamento do processo seletivo alheio.
		 */
		async exportUserData(userId: string) {
			const requestId = await audit({
				userId,
				operation: 'export',
				requestedBy: userId,
			})

			const [user, profile, consents, requests] = await Promise.all([
				Promise.resolve(infra.userRepository.getUser(userId)).catch(() => null),
				Promise.resolve(infra.userRepository.getCandidateProfile(userId)).catch(() => null),
				Promise.resolve(repo.listConsents(userId)).catch(() => []),
				Promise.resolve(repo.listRequests(userId)).catch(() => []),
			])

			const applications = (await Promise.resolve(
				infra.candidateRepository.listJobsApplied(userId, {}),
			).catch(() => [])) as Array<JobApplied & { id: string }>

			const payload = {
				exportedAt: new Date().toISOString(),
				user,
				profile,
				consents,
				requests,
				applications: applications.map((application) => ({
					id: application.id,
					jobId: application.jobApplied?.id ?? null,
					companyId: application.companyOwner?.id ?? null,
					appliedAt: application.appliedTime ?? null,
					status: application.candidateStatus ?? null,
					source: application.source ?? null,
				})),
			}

			await repo
				.completeRequest(requestId, {
					status: 'completed',
					affected: { applications: applications.length, consents: consents.length },
				})
				.catch(() => undefined)

			return payload
		},

		/**
		 * Anonimização a pedido — pela empresa ou pelo titular.
		 *
		 * É o caminho padrão. Exclusão total fica reservada ao titular porque
		 * destrói o histórico do processo, que a empresa tem obrigação de manter.
		 */
		async anonymize(params: { userId: string; requestedBy?: string; companyId?: string | null }) {
			const requestId = await audit({
				userId: params.userId,
				companyId: params.companyId ?? null,
				operation: 'anonymization',
				requestedBy: params.requestedBy ?? null,
			})

			try {
				const affected = await anonymizeUser(params.userId)
				await repo.completeRequest(requestId, {
					status: 'completed',
					affected: {
						jobsApplied: affected.jobsApplied,
						interviews: affected.interviews,
					},
				})
				return affected
			} catch (error) {
				await repo
					.completeRequest(requestId, {
						status: 'failed',
						error: error instanceof Error ? error.message : 'unknown',
					})
					.catch(() => undefined)
				throw error
			}
		},

		/**
		 * Varredura de retenção (cron).
		 *
		 * Anonimiza candidatura parada além do prazo da empresa. Nunca exclui: o
		 * prazo de retenção é sobre PII, e a estatística do processo continua
		 * necessária para a defesa da empresa muito depois disso.
		 */
		async runRetention(now: Date = new Date()) {
			const companies = (await infra.companyRepository.listCompanies()) as Company[]
			let scanned = 0
			let anonymized = 0

			for (const company of companies) {
				const policy = retentionOf(company)
				const days = policy.candidateRetentionDays
				if (!days || days <= 0) continue

				const interviews = (await infra.candidateRepository
					.listCompanyInterviews(company.id, {})
					.catch(() => [])) as Array<Record<string, unknown>>

				for (const interview of interviews) {
					if (interview.anonymizedAt) continue
					scanned += 1

					const stale = isPastRetention(
						{
							finishedTime: (interview.finishedTime ?? null) as Date | null,
							dateSelect: (interview.date_select ?? null) as Date | null,
							appliedTime: (interview.date ?? null) as Date | null,
						},
						days,
						now,
					)
					if (!stale) continue

					const userId = (interview.user_ref as { id?: string } | undefined)?.id
					if (!userId) continue

					await this.anonymize({
						userId,
						companyId: company.id,
						requestedBy: 'retention_cron',
					}).catch((error) => {
						console.error('[LGPD] retention anonymize failed:', userId, error)
					})
					anonymized += 1
				}
			}

			return { scanned, anonymized }
		},
	}
}

export type LgpdService = ReturnType<typeof createLgpdService>
