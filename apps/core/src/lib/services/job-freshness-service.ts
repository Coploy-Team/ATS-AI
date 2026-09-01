import type { Company, PostJob } from '@coploy/domain'
import { DEFAULT_FRESHNESS_SLA_DAYS } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * Auto-pause por falta de frescor (V2-604, GAP 9).
 *
 * O anti-ghosting existente olha **candidato parado**: pessoa esperando resposta
 * além do prazo. Esta regra olha o oposto — a **vaga parada**: ninguém novo
 * entra, ninguém avança, e o anúncio continua no ar coletando currículo. É esse
 * o formato do ghost job, e é por isso que ele não é pego pela régua anterior.
 *
 * O que a regra faz é despublicar, **não** fechar: a vaga volta com um clique
 * quando o recrutador confirmar que ainda está contratando. Fechar sozinho
 * destruiria processo em andamento por causa de um período de férias.
 */

export type JobFreshnessRunResult = {
	jobsScanned: number
	jobsPaused: number
}

/** Movimentação = candidatura nova ou transição de etapa. */
function resolveLastActivity(job: PostJob, interviews: Array<Record<string, unknown>>): Date | null {
	const candidates: Array<Date | null> = [
		job.lastActivityAt ?? null,
		job.timeCreated ? new Date(job.timeCreated as unknown as string) : null,
	]

	for (const interview of interviews) {
		for (const key of ['stageEnteredAt', 'date_select', 'date']) {
			const value = interview[key]
			if (value) {
				const parsed = value instanceof Date ? value : new Date(String(value))
				if (!Number.isNaN(parsed.getTime())) candidates.push(parsed)
			}
		}
	}

	const valid = candidates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
	if (valid.length === 0) return null
	return valid.reduce((latest, current) => (current > latest ? current : latest))
}

export function daysBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Só entra na regra a vaga que **declarou** prazo de frescor. Sem declaração,
 * não há promessa a cobrar — e pausar sozinho a vaga de quem nunca optou seria
 * exatamente o tipo de surpresa que derruba a confiança na ferramenta.
 */
export function isStale(job: PostJob, lastActivity: Date | null, now: Date): boolean {
	const slaDays = job.freshnessSlaDays
	if (!slaDays || slaDays <= 0) return false
	if (job.stopped === true || job.public !== true) return false
	if (!lastActivity) return false
	return daysBetween(lastActivity, now) >= slaDays
}

export function createJobFreshnessService(infra: InfraProvider) {
	async function pause(job: PostJob & { companyId: string }, now: Date) {
		await infra.jobRepository.updateJob(job.companyId, job.id, {
			public: false,
			freshnessPausedAt: now,
		} as never)
	}

	return {
		defaultSlaDays: DEFAULT_FRESHNESS_SLA_DAYS,
		isStale,
		resolveLastActivity,

		async run(now: Date = new Date()): Promise<JobFreshnessRunResult> {
			const result: JobFreshnessRunResult = { jobsScanned: 0, jobsPaused: 0 }

			const companies = (await infra.companyRepository.listCompanies()) as Company[]

			for (const company of companies) {
				const jobs = (await infra.jobRepository
					.listJobs(company.id, {})
					.catch(() => [])) as PostJob[]

				for (const job of jobs) {
					if (!job.freshnessSlaDays || job.freshnessSlaDays <= 0) continue
					result.jobsScanned += 1

					const interviews = (await infra.candidateRepository
						.listJobInterviews(company.id, job.id)
						.catch(() => [])) as Array<Record<string, unknown>>

					const lastActivity = resolveLastActivity(job, interviews)
					if (!isStale(job, lastActivity, now)) continue

					await pause({ ...job, companyId: company.id }, now).catch((error) => {
						console.error('[JobFreshness] pause failed:', job.id, error)
					})
					result.jobsPaused += 1
				}
			}

			return result
		},
	}
}

export type JobFreshnessService = ReturnType<typeof createJobFreshnessService>
