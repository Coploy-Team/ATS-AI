import axios from 'axios'

import type { Company, JobApplied, PostJob, User } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'
import { env } from '@/env'
import { recordCoreAiUsage } from '@/lib/ai-usage'

/**
 * Entrevista de perfil do candidato ("Dream Jobs").
 *
 * Modelo: o candidato não se candidata a uma vaga — ele faz UMA entrevista com
 * IA sobre o próprio perfil e, ao finalizar, o resultado é publicado no hunting
 * (`public_interviews`), ficando visível para as empresas.
 *
 * Para reusar a máquina de entrevista existente, o fluxo gera uma **vaga-espelho**
 * (JD + competências + perguntas do cargo/nível do candidato). Essa vaga:
 *  - nasce `public: false` + `profileInterview: true` → nunca aparece em listagem
 *    de vagas (portal, MCP `search_jobs`);
 *  - mantém `typeInterview: 'interview'` → é o que faz o finish-service espelhar
 *    o resultado no hunting.
 *
 * Esta orquestração vivia no browser (web/interview fazia 4 round-trips e criava
 * a vaga com o token do candidato). Trazê-la para cá torna o fluxo atômico do
 * ponto de vista do cliente, idempotente, e reusável por qualquer canal —
 * é o que permite o plugin de ChatGPT/Claude oferecer o mesmo produto.
 *
 * Sem paywall: a entrevista de perfil é aberta a qualquer candidato autenticado.
 */

export interface ProvisionProfileInterviewParams {
	/** Cargo alvo do candidato (ex.: "Desenvolvedor Full Stack"). */
	occupation: string
	/** Nível (ex.: junior/pleno/senior) — texto livre, repassado ao engine. */
	level: string
	/** Idioma da entrevista (pt-BR, en...). Default pt-BR. */
	language?: string
	/** Objetivos profissionais — personalizam a JD e as perguntas. */
	objectives?: string
}

export interface ProfileInterviewStatus {
	hasInterview: boolean
	jobId: string | null
	companyId: string | null
	status: 'not_started' | 'pending' | 'in_progress' | 'completed'
	/**
	 * O documento da entrevista. Vem da BUSCA pela vaga-espelho, não do ponteiro:
	 * `dreamJobsInterview.jobAppliedId` só é gravado se o app de entrevista
	 * chamar a rota de progresso, e quem termina por outro caminho fica sem.
	 */
	jobAppliedId: string | null
	interviewUrl: string | null
	createdAt: string | null
	completedAt: string | null
}

export interface ProvisionProfileInterviewResult extends ProfileInterviewStatus {
	/** true quando a vaga-espelho foi gerada agora (false = já existia). */
	created: boolean
	jobName: string | null
	questionCount: number
}

interface EngineContext {
	/** Token do candidato — repassado ao ai-engine, como nas rotas /ia/*. */
	accessToken: string
	requestId?: string
}

const ENGINE_TIMEOUT_MS = 120_000
/** Janela de validade da vaga-espelho; a entrevista deve ser feita nesse prazo. */
const CLOSING_DAYS = 30

function normalizeEngineLanguage(language: string): string {
	return language.split('-')[0] || 'pt'
}

function buildInterviewUrl(jobId: string, companyId: string): string {
	return `${env.INTERVIEW_BASE_URL}/job/${jobId}/company/${companyId}/login`
}

function toIso(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
	}
	const ts = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
	if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
	const seconds = ts._seconds ?? ts.seconds
	return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

function normalizeStatus(value: string | null | undefined): ProfileInterviewStatus['status'] {
	const status = (value ?? '').toLowerCase()
	if (status === 'completed' || status === 'in_progress' || status === 'pending') return status
	return 'pending'
}

export function createProfileInterviewService(infra: InfraProvider) {
	async function callEngine<T>(path: string, body: Record<string, unknown>, ctx: EngineContext): Promise<T> {
		const engineUrl = env.ENGINE_URL ?? 'http://localhost:3334'
		const response = await axios.post<T>(`${engineUrl}${path}`, body, {
			headers: {
				Authorization: `Bearer ${ctx.accessToken}`,
				'Content-Type': 'application/json',
				...(ctx.requestId ? { 'X-Request-Id': ctx.requestId } : {}),
			},
			timeout: ENGINE_TIMEOUT_MS,
		})
		return response.data
	}

	async function resolveHostCompany(): Promise<Company & { id: string }> {
		const companyId = env.PROFILE_INTERVIEW_COMPANY_ID
		if (!companyId) {
			throw new BadRequestError(
				'PROFILE_INTERVIEW_COMPANY_ID não configurado — defina a empresa que hospeda as entrevistas de perfil',
			)
		}
		const company = (await infra.companyRepository.getCompany(companyId)) as (Company & { id: string }) | null
		if (!company) {
			throw new BadRequestError(`Empresa de entrevistas de perfil não encontrada: ${companyId}`)
		}
		// Enterprise não publica no hunting (guard do finish-service) — a entrevista
		// de perfil perderia todo o propósito.
		const plan = (
			company.subscriptionPlan ??
			(company as { subscriptionDetails?: { plan?: string | null } | null }).subscriptionDetails?.plan ??
			''
		).toLowerCase()
		if (plan === 'enterprise') {
			throw new BadRequestError(
				'Empresa de entrevistas de perfil não pode ser enterprise (resultado não seria publicado no hunting)',
			)
		}
		return company
	}

	/**
	 * A entrevista de perfil do candidato, buscada pela vaga-espelho.
	 *
	 * `dreamJobsInterview` guarda o `jobId` (gravado no provision) mas não o
	 * documento da entrevista, e o `status` dele nasce `pending` e **nunca
	 * avança**: o único escritor é a rota de progresso, que depende do app de
	 * entrevista chamá-la. Quem terminou por outro caminho ficava com o espelho
	 * dizendo "pendente" pra sempre — foi assim que uma entrevista concluída
	 * sumiu da área do candidato.
	 *
	 * Por isso a verdade é o `jobsApplied`: quem respondeu, respondeu.
	 */
	async function findInterviewDoc(userId: string, jobId: string) {
		const docs = await infra.candidateRepository
			.listJobsApplied(userId, {
				filters: [{ field: 'jobApplied.id', operator: '==', value: jobId }],
				limitTo: 1,
			})
			.catch(() => [] as JobApplied[])
		return docs[0] ?? null
	}

	async function readStatus(
		user: User & { id?: string },
		userId?: string,
	): Promise<ProfileInterviewStatus> {
		const interview = user.dreamJobsInterview
		if (!interview?.jobId) {
			return {
				hasInterview: false,
				jobId: null,
				companyId: null,
				status: 'not_started',
				jobAppliedId: null,
				interviewUrl: null,
				createdAt: null,
				completedAt: null,
			}
		}
		const espelhado = normalizeStatus(interview.status)
		const id = userId ?? user.id

		// Só vale a leitura extra enquanto o espelho não diz "concluída": depois
		// disso ele não volta atrás, e o custo seria por request.
		const doc = espelhado !== 'completed' && id ? await findInterviewDoc(id, interview.jobId) : null
		const concluida = doc?.finished === true

		// A empresa hospedeira é a da PRÓPRIA entrevista quando ela existe: a env
		// é só o padrão de quem ainda vai gravar.
		const companyId = doc?.companyOwner?.id ?? env.PROFILE_INTERVIEW_COMPANY_ID ?? null

		return {
			hasInterview: true,
			jobId: interview.jobId,
			companyId,
			status: concluida ? 'completed' : espelhado,
			jobAppliedId: doc?.id ?? interview.jobAppliedId ?? null,
			interviewUrl: companyId ? buildInterviewUrl(interview.jobId, companyId) : null,
			createdAt: toIso(interview.createdAt),
			completedAt: toIso(interview.completedAt) ?? toIso(doc?.finishedTime),
		}
	}

	return {
		async getStatus(userId: string): Promise<ProfileInterviewStatus> {
			const user = (await infra.userRepository.getUser(userId)) as User | null
			if (!user) throw new BadRequestError('Usuário não encontrado')
			return readStatus(user, userId)
		},

		/**
		 * Idempotente: se o candidato já tem entrevista de perfil, devolve a
		 * existente em vez de gerar outra vaga (e outro custo de IA).
		 */
		async provision(
			userId: string,
			params: ProvisionProfileInterviewParams,
			ctx: EngineContext,
		): Promise<ProvisionProfileInterviewResult> {
			const user = (await infra.userRepository.getUser(userId)) as User | null
			if (!user) throw new BadRequestError('Usuário não encontrado')

			const existing = await readStatus(user, userId)
			if (existing.hasInterview && existing.jobId) {
				const job = existing.companyId
					? ((await infra.jobRepository.getJob(existing.companyId, existing.jobId)) as PostJob | null)
					: null
				return {
					...existing,
					created: false,
					jobName: job?.jobName ?? null,
					questionCount: job?.jobQuestions?.length ?? 0,
				}
			}

			const occupation = params.occupation.trim()
			const level = params.level.trim()
			if (!occupation || !level) {
				throw new BadRequestError('Cargo e nível são obrigatórios para gerar a entrevista de perfil')
			}

			const company = await resolveHostCompany()
			const language = params.language ?? user.language ?? 'pt-BR'
			const idioma = normalizeEngineLanguage(language)
			// Objetivos entram como contexto do cargo (mesma convenção do fluxo web)
			const cargo = params.objectives
				? `${occupation} (Objetivos: ${params.objectives.slice(0, 200)})`
				: occupation

			const aiUsageBase = {
				infra,
				company,
				userId,
				requestId: ctx.requestId,
				metadata: { origin: 'profile_interview', cargo: occupation, nivel: level, idioma },
			} as const

			// 1. Descrição da vaga-espelho
			const jobDescription = await callEngine<{
				descricao: string
				responsabilidades: string
				requisitos: string
				model?: string
				provider?: string
				usage?: Record<string, number>
			}>('/job-description/generate', { nivel: level, cargo, idioma }, ctx)
			recordCoreAiUsage({
				...aiUsageBase,
				surface: 'job_generate_description',
				model: jobDescription.model,
				provider: jobDescription.provider as never,
				usage: jobDescription.usage as never,
			})

			// 2. Competências
			const skills = await callEngine<{
				competencias_criticas: string | null
				competencias_adicionais: string | null
				expectativa: string | null
				model?: string
				provider?: string
				usage?: Record<string, number>
			}>(
				'/job-description/generate-skill-description',
				{
					cargo,
					nivel: level,
					descricao: jobDescription.descricao,
					responsabilidades: jobDescription.responsabilidades,
					requisitos: jobDescription.requisitos,
					idioma,
				},
				ctx,
			)
			recordCoreAiUsage({
				...aiUsageBase,
				surface: 'job_generate_skills',
				model: skills.model,
				provider: skills.provider as never,
				usage: skills.usage as never,
			})

			// 3. Perguntas da entrevista
			const questions = await callEngine<{
				perguntas: string[]
				model?: string
				provider?: string
				usage?: Record<string, number>
			}>(
				'/job-description/generate-questions',
				{
					cargo,
					nivel: level,
					descricao: jobDescription.descricao,
					responsabilidades: jobDescription.responsabilidades,
					requisitos: jobDescription.requisitos,
					criticas: skills.competencias_criticas ?? undefined,
					adicionais: skills.competencias_adicionais ?? undefined,
					expectativa: skills.expectativa ?? undefined,
					idioma,
				},
				ctx,
			)
			recordCoreAiUsage({
				...aiUsageBase,
				surface: 'job_generate_questions',
				model: questions.model,
				provider: questions.provider as never,
				usage: questions.usage as never,
			})

			if (!questions.perguntas?.length) {
				throw new BadRequestError('AI Engine não retornou perguntas para a entrevista de perfil')
			}

			// 4. Vaga-espelho — invisível em listagens, mas entrevistável e publicável no hunting
			const closingDate = new Date()
			closingDate.setDate(closingDate.getDate() + CLOSING_DAYS)

			const jobData = {
				identifier: `profile-${userId}-${Date.now()}`,
				jobName: `${occupation} - ${level}`,
				jobDescription: jobDescription.descricao,
				jobResponsabilities: jobDescription.responsabilidades,
				jobRequirements: jobDescription.requisitos,
				competencias_criticas: skills.competencias_criticas ?? '',
				competencias_adicionais: skills.competencias_adicionais ?? '',
				expectativas: skills.expectativa ?? '',
				carrerLevel: level,
				language,
				typeInterview: 'interview',
				interviewMode: 'video' as const,
				// Invariantes do fluxo de perfil
				profileInterview: true,
				public: false,
				stopped: false,
				archived: false,
				priority: false,
				timeCreated: new Date(),
				closingDate,
				jobQuestions: questions.perguntas.map((question, index) => ({
					id: String(index + 1),
					question,
				})),
			}

			const createdJob = await infra.jobRepository.createJob(company.id, jobData)

			// 5. Vínculo no candidato — é o marcador durável do fluxo
			await infra.userRepository.updateUser(userId, {
				dreamJobsInterview: {
					jobId: createdJob.id,
					createdAt: new Date(),
					status: 'pending',
				},
			})

			return {
				hasInterview: true,
				created: true,
				jobId: createdJob.id,
				companyId: company.id,
				status: 'pending',
				jobAppliedId: null,
				interviewUrl: buildInterviewUrl(createdJob.id, company.id),
				createdAt: new Date().toISOString(),
				completedAt: null,
				jobName: jobData.jobName,
				questionCount: jobData.jobQuestions.length,
			}
		},
	}
}

export type ProfileInterviewService = ReturnType<typeof createProfileInterviewService>
