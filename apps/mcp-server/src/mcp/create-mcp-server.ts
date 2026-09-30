import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { env } from '@/env'
import { installationFeatures, type InstallationFeatures } from '@/lib/features'

import type { CandidateAuthService } from '@/lib/services/candidate-auth-service'
import type { CandidateInterviewsService } from '@/lib/services/candidate-interviews-service'
import type { CandidateProfileService } from '@/lib/services/candidate-profile-service'
import type { PublicJobsService, SupportedLanguage } from '@/lib/services/public-jobs-service'
import { JOB_LIST_WIDGET_HTML, JOB_LIST_WIDGET_URI } from './widgets/job-list-widget'
import { AVAILABILITIES, WORK_MODALITIES } from './profile-fields'
import { PROFILE_GAPS_WIDGET_HTML, PROFILE_GAPS_WIDGET_URI } from './widgets/profile-gaps-widget'

// O ChatGPT em produção detecta widgets pelo mimeType legado skybridge
// (confirmado nos openai-apps-sdk-examples); text/html;profile=mcp-app é o
// padrão MCP Apps futuro — trocar quando o host passar a aceitá-lo.
const WIDGET_MIME_TYPE = 'text/html+skybridge'

/** Domínios que o iframe do widget pode carregar (logos das empresas). */
const WIDGET_RESOURCE_DOMAINS = [
	'https://firebasestorage.googleapis.com',
	'https://storage.googleapis.com',
	'https://api.dicebear.com',
]

const WIDGET_RESOURCE_META = {
	'openai/widgetDescription':
		'Interactive list of open jobs on Coploy with company logo, salary and a button that opens the AI interview.',
	// Sem moldura do host: ela recortava o conteúdo nas laterais (o iframe é
	// mais largo que a área visível dela) e duplicava a identidade — o ChatGPT
	// já exibe "Coploy" no cabeçalho do app. Os cards têm borda própria.
	'openai/widgetPrefersBorder': false,
	// Chave legada do ChatGPT (snake_case) + forma padrão MCP Apps (camelCase)
	'openai/widgetCSP': {
		connect_domains: [],
		resource_domains: WIDGET_RESOURCE_DOMAINS,
	},
	ui: {
		prefersBorder: false,
		csp: { connectDomains: [], resourceDomains: WIDGET_RESOURCE_DOMAINS },
	},
}

/**
 * Annotations MCP: dizem ao host o que a tool faz. Sem elas o ChatGPT trata
 * qualquer tool como ação de risco desconhecido e, com a preferência do
 * usuário em "permitir ações de baixo risco", chega a bloquear a chamada
 * antes de sair (o servidor nem recebe o request).
 *
 * Nenhuma tool nossa destrói dado: as de escrita criam-ou-retomam e são
 * idempotentes de verdade (start_interview e start_profile_interview
 * devolvem a entrevista existente; update_my_profile faz merge parcial).
 */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const
const SAFE_WRITE = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const

const PROFILE_WIDGET_META = {
	'openai/widgetDescription':
		'Short form with only the missing résumé fields, with a skip option.',
	'openai/widgetPrefersBorder': false,
	'openai/widgetCSP': { connect_domains: [], resource_domains: [] },
}

/**
 * Roteiro de condução do assistente (campo `instructions` do `initialize`).
 *
 * É o que faz o modelo CONDUZIR a conversa em vez de esperar o candidato saber
 * o que pedir. Descrição de tool responde "quando chamo isto?"; isto responde
 * "para onde estou levando a pessoa e o que ofereço a seguir".
 *
 * Regras vivem aqui, e não em prompt do usuário, porque o host injeta isto em
 * toda conversa — inclusive quando ele abre com "oi".
 */
/**
 * Campos do COP-6 que o core grava e o chat não alcançava (COP-22). Os valores
 * fechados são os mesmos da área do candidato — vocabulário único, senão a
 * tela mostra "Remoto" e o assistente grava "home office".
 */
const workModalitiesSchema = z
	.array(z.enum(WORK_MODALITIES))
	.max(3)
	.describe('Work modalities the candidate accepts: remote, hybrid, onsite (any combination)')
const availabilitySchema = z
	.enum(AVAILABILITIES)
	.describe('When the candidate can start: immediate, 15_days, 30_days or negotiable')
const bioSchema = z.string().max(280).describe('Short bio shown on the public profile (max 280 chars)')
const skillDetailsSchema = z
	.array(
		z.object({
			name: z.string().min(1),
			level: z.string().optional().describe('e.g. "básico", "avançado", "5 anos"'),
			evidence: z.string().optional().describe('Where it was used, in one line'),
		}),
	)
	.max(100)
	.describe('Skills with a level and evidence — use when the person says HOW well they know something')

const SERVER_INSTRUCTIONS = `Coploy is a hiring platform. Candidates do NOT "apply" to jobs: they open an interviewUrl and record an interview led by AI. Never use the vocabulary of applications, resumes sent, or recruiters reading a CV.

Speak the user's language (pt-BR or en) in every message, and pass that language to the tools.

IDENTITY. The connected Coploy account IS the person you are talking to: every profile you read and every field you write belongs to them. The name on that profile may not match the name you know from elsewhere — nickname, full legal name, an account opened with someone else's details, a shared device. That is never a reason to treat the profile as a third party. Never offer to build a résumé "for" that other person, never write about them in the third person, and never ask which profile to use: there is only one, the connected one. If the name looks wrong, simply offer to fix it with update_my_profile and carry on.

TWO DOORS. When the user arrives without a clear goal (e.g. just says hi), offer both in one short message and let them pick:
1. Find a job now — search_jobs.
2. Build their living résumé and record the profile interview — the interview that puts them in front of companies hunting for talent, with no specific job attached.

BUILDING THE RÉSUMÉ — never interrogate. Long questionnaires are exactly where candidates give up. Open with ONE of these, not with a list of questions:
- "Tell me about your career so far" (one open question), or
- "Send me your CV or paste your LinkedIn text and I'll fill it in for you."
Structure whatever you get and send it in a SINGLE import_profile call. Then call get_my_profile and ask ONLY about what askAbout names — at most two things. The remaining gaps are deliberately not exposed to you, because a roll call of everything the person still owes is the same form fatigue in prose, and an incomplete résumé that exists beats a perfect one that was abandoned. When there are still gaps left, offer complete_my_profile in the same message as the click-instead-of-type alternative.

AFTER AN INTERVIEW, CLOSE THE LOOP. Finishing an interview is the start of the next one, not the end. When someone has completed interviews, offer get_my_insights — what their answers show about how they communicate — and then actually coach: explain what the weakest dimension means in practice, and offer to rehearse a question right here in the chat. This is the part the website cannot do, and it is why the candidate comes back.

NEVER hand out a verdict. Score, approved/rejected and fit-for-the-vacancy belong to the recruiter who requested the interview, and the tools deliberately do not return them. If asked "did I pass?", say plainly that the decision is the company's and you do not have it — then turn to what they CAN act on: what was observed in their answers and how to do better next time.

ALWAYS CLOSE WITH THE NEXT STEP. Every answer ends by proposing the natural next action ("want me to look for jobs like this?", "shall we record your profile interview?"), so the person never has to guess what to type. Follow the nextStep field from get_my_profile.

LINKS. interviewUrl already carries the candidate's session and is single-use: hand it over as-is, once, and say the interview is recorded in the browser, not in this chat.`

export interface McpServerDeps {
	publicJobsService: PublicJobsService
	candidateAuthService: CandidateAuthService
	interviewsService: CandidateInterviewsService
	profileService: CandidateProfileService
	/** uid do candidato quando o request veio com Bearer válido. */
	authenticatedUid?: string
	/** O que esta instalação tem; ausente = lido da configuração. */
	features?: InstallationFeatures
}

/**
 * Resposta das tools que dependem de algo que esta instalação não tem. O
 * assistente precisa do MOTIVO, senão inventa um — e do que fazer em vez.
 */
const NOT_AVAILABLE = {
	motor: {
		error: 'motor_not_installed',
		message:
			'This installation has no interview engine (the Coploy Motor plugin is not installed), so AI interviews cannot be started here. ' +
			'Tell the person plainly; if the job has a public page (interviewUrl), that is where they apply.',
	},
	candidateApp: {
		error: 'candidate_area_not_available',
		message:
			'This installation has no candidate area, so there is no page to upload the résumé file. ' +
			'What the CV says is already saved through import_profile; the file itself cannot be attached here.',
	},
} as const

function notAvailable(what: keyof typeof NOT_AVAILABLE) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(NOT_AVAILABLE[what]) }],
		isError: true as const,
	}
}

function normalizeProfileLanguage(language: string | null): SupportedLanguage | undefined {
	if (!language) return undefined
	const prefix = language.trim().toLowerCase().split(/[-_]/)[0]
	if (prefix === 'pt') return 'pt-BR'
	if (prefix === 'en') return 'en'
	return undefined
}

/**
 * Instância MCP por request (transport stateless exige 1 server por conexão).
 * Services chegam prontos do register-time da rota — nunca criar infra aqui.
 * Tools de conta (entrevistas) só existem com uid autenticado.
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
	const { publicJobsService, candidateAuthService, interviewsService, profileService, authenticatedUid } = deps
	const features = deps.features ?? installationFeatures()
	const server = new McpServer(
		{
			name: 'coploy',
			version: '1.0.0',
			// §6.4 do OTS: o provedor DECLARA o protocolo que fala — era o
			// "identificador de protocolo que não existe" do ADR-006.
			title: 'Coploy (OTS/0.1)',
		},
		{ instructions: SERVER_INSTRUCTIONS },
	)

	// Widget de cards de vagas (Apps SDK/MCP Apps) — template do search_jobs
	server.registerResource(
		'coploy-job-list',
		JOB_LIST_WIDGET_URI,
		{
			title: 'Coploy job list widget',
			mimeType: WIDGET_MIME_TYPE,
			_meta: WIDGET_RESOURCE_META,
		},
		async () => ({
			contents: [
				{
					uri: JOB_LIST_WIDGET_URI,
					mimeType: WIDGET_MIME_TYPE,
					text: JOB_LIST_WIDGET_HTML,
					_meta: WIDGET_RESOURCE_META,
				},
			],
		}),
	)

	// Editor de lacunas do currículo (Apps SDK) — só existe autenticado, mas o
	// resource é registrado sempre pro host conseguir resolver o template.
	server.registerResource(
		'coploy-profile-gaps',
		PROFILE_GAPS_WIDGET_URI,
		{
			title: 'Coploy profile gaps editor',
			mimeType: WIDGET_MIME_TYPE,
			_meta: PROFILE_WIDGET_META,
		},
		async () => ({
			contents: [
				{
					uri: PROFILE_GAPS_WIDGET_URI,
					mimeType: WIDGET_MIME_TYPE,
					text: PROFILE_GAPS_WIDGET_HTML,
					_meta: PROFILE_WIDGET_META,
				},
			],
		}),
	)

	/**
	 * Mensagens prontas (primitiva `prompts` do MCP).
	 *
	 * O host as exibe como atalhos clicáveis, então o candidato não precisa
	 * descobrir sozinho o que dá pra pedir — ele escolhe uma e a conversa já
	 * começa no lugar certo. O texto é o que seria digitado; quem conduz dali
	 * em diante é o roteiro em SERVER_INSTRUCTIONS.
	 *
	 * Suporte varia por host (o Claude lista; o ChatGPT hoje ignora), por isso
	 * é reforço de descoberta — nunca o único caminho pra uma ação.
	 */
	const PROMPT_TEXT = {
		'pt-BR': {
			findJobs: (role?: string) =>
				role
					? `Quero ver vagas de ${role} na Coploy.`
					: 'Quero ver vagas abertas na Coploy. Me pergunta o que precisar pra buscar as certas.',
			buildProfile:
				'Quero montar meu currículo na Coploy. Prefiro te contar minha trajetória de uma vez ' +
				'(ou mandar meu CV) a responder pergunta por pergunta.',
			profileInterview:
				'Quero fazer minha entrevista de perfil na Coploy pra aparecer pras empresas. ' +
				'Confere o que falta no meu currículo antes e me manda o link.',
			myInterviews: 'Como estão minhas entrevistas na Coploy?',
			myInsights:
				'O que minhas entrevistas na Coploy mostram sobre mim? Quero saber onde melhorar ' +
				'e treinar com você.',
		},
		en: {
			findJobs: (role?: string) =>
				role
					? `Show me ${role} jobs on Coploy.`
					: 'Show me open jobs on Coploy. Ask me whatever you need to find the right ones.',
			buildProfile:
				'I want to build my Coploy résumé. I would rather tell you my story in one go ' +
				'(or send my CV) than answer question by question.',
			profileInterview:
				'I want to record my Coploy profile interview so companies can find me. ' +
				'Check what is missing in my résumé first, then send me the link.',
			myInterviews: 'How are my Coploy interviews going?',
			myInsights:
				'What do my Coploy interviews say about me? I want to know where to improve and ' +
				'practise with you.',
		},
	} as const

	async function promptLocale(): Promise<'pt-BR' | 'en'> {
		if (!authenticatedUid) return 'pt-BR'
		return normalizeProfileLanguage(await candidateAuthService.getUserLanguage(authenticatedUid)) === 'en'
			? 'en'
			: 'pt-BR'
	}

	function userMessage(text: string) {
		return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
	}

	server.registerPrompt(
		'find_jobs',
		{
			title: 'Buscar vagas · Find jobs',
			description: 'Ver vagas abertas na Coploy e abrir a entrevista de uma delas.',
			argsSchema: {
				role: z.string().optional().describe('Cargo ou área de interesse (opcional)'),
			},
		},
		async ({ role }) => userMessage(PROMPT_TEXT[await promptLocale()].findJobs(role)),
	)

	if (authenticatedUid) {
		server.registerPrompt(
			'build_my_profile',
			{
				title: 'Montar meu currículo · Build my résumé',
				description: 'Preencher o currículo conversando (ou mandando o CV), sem formulário longo.',
			},
			async () => userMessage(PROMPT_TEXT[await promptLocale()].buildProfile),
		)

		server.registerPrompt(
			'profile_interview',
			{
				title: 'Entrevista de perfil · Profile interview',
				description: 'Gerar a entrevista que expõe o candidato para as empresas que fazem hunting.',
			},
			async () => userMessage(PROMPT_TEXT[await promptLocale()].profileInterview),
		)

		server.registerPrompt(
			'my_insights',
			{
				title: 'Como estou me saindo · How am I doing',
				description: 'O que as entrevistas mostram sobre a comunicação do candidato, e como melhorar.',
			},
			async () => userMessage(PROMPT_TEXT[await promptLocale()].myInsights),
		)

		server.registerPrompt(
			'my_interviews',
			{
				title: 'Minhas entrevistas · My interviews',
				description: 'Ver entrevistas concluídas e retomar as que ficaram pela metade.',
			},
			async () => userMessage(PROMPT_TEXT[await promptLocale()].myInterviews),
		)
	}

	server.registerTool(
		'search_jobs',
		{
			title: 'Search jobs on Coploy',
			annotations: READ_ONLY,
			_meta: {
				// Widget declarado SÓ nas chaves do ChatGPT (openai/*).
				//
				// Não anunciamos `ui.resourceUri` (padrão MCP Apps) porque o Claude
				// segue essa chave, tenta renderizar e falha — o HTML aqui fala a
				// API `window.openai` do Apps SDK, não a ponte postMessage do MCP
				// Apps, e o mimeType que ele espera é `text/html;profile=mcp-app`,
				// não o `text/html+skybridge` que o ChatGPT exige. Resultado no
				// teste real: "Houve um problema ao exibir o conteúdo".
				//
				// Sem a chave, o Claude usa o texto da tool (que é completo) e a
				// conversa flui. Reintroduzir quando o widget falar os dois
				// protocolos — aí com um resource por mimeType.
				'openai/outputTemplate': JOB_LIST_WIDGET_URI,
				// Permite o widget chamar tools (paginação "mostrar mais vagas")
				'openai/widgetAccessible': true,
				'openai/toolInvocation/invoking': 'Buscando vagas na Coploy',
				'openai/toolInvocation/invoked': 'Vagas encontradas',
			},
			description:
				'Search open job opportunities published on Coploy. ' +
				'Use when the user wants to find a job, explore opportunities, or asks what positions are available. ' +
				'Returns jobs with company, location, salary (when available) and an interviewUrl: on Coploy the candidate does not "apply" — ' +
				'they open that link and record an AI-led interview for the role. ' +
				'Set `language` to the language the user is speaking (pt-BR or en) to prioritize jobs in that language. ' +
				'`totalAvailable` tells how many jobs match in total — call again with a higher `limit` ONLY if the user asks for more. ' +
				'Prefer ONE broad search over several narrow ones: each call renders its own card list in the chat, and repeated calls clutter the conversation. ' +
				'If a search returns nothing, widen or drop the query instead of retrying variations.',
			inputSchema: {
				query: z
					.string()
					.optional()
					.describe('Free-text search: role name, skills, city, company... (e.g. "product manager remote")'),
				language: z
					.enum(['pt-BR', 'en'])
					.optional()
					.describe('Filter jobs by language. Use the language the user is conversing in.'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe('Max results (default 10)'),
			},
		},
		async ({ query, language, limit }) => {
			// Autenticado sem language explícito → preferência do perfil decide
			let effectiveLanguage = language
			if (!effectiveLanguage && authenticatedUid) {
				const profileLanguage = await candidateAuthService.getUserLanguage(authenticatedUid)
				effectiveLanguage = normalizeProfileLanguage(profileLanguage)
			}
			const { jobs, totalAvailable } = await publicJobsService.searchJobs({
				query,
				language: effectiveLanguage,
				limit,
			})
			// Um ÚNICO ticket por busca (não por vaga): o handoff autentica a
			// sessão, não uma vaga específica, então o widget pode anexá-lo ao
			// link que a pessoa clicar. É isso que torna o clique instantâneo —
			// sem ele o botão teria que chamar uma tool e esperar.
			const handoff = authenticatedUid && jobs.length > 0
				? await interviewsService.issueSessionHandoff(authenticatedUid)
				: null

			// language segue a regra do canal: explícito > perfil > pt-BR default.
			// O widget usa pra localizar as strings da UI; totalAvailable habilita
			// o "mostrar mais vagas" (não existe site público listando todas).
			const payload = {
				total: jobs.length,
				totalAvailable,
				language: effectiveLanguage ?? 'pt-BR',
				query: query ?? null,
				handoff,
				jobs,
			}
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(payload, null, 2),
					},
				],
				// Widget lê via window.openai.toolOutput; o modelo lê o texto acima
				structuredContent: payload,
			}
		},
	)

	server.registerTool(
		'get_job_details',
		{
			title: 'Get job details on Coploy',
			annotations: READ_ONLY,
			description:
				'Get the full public description of a specific job on Coploy (description, requirements, responsibilities, benefits, interview format). ' +
				'Use after search_jobs when the user wants to know more about one opportunity. ' +
				'Requires the companyId and jobId returned by search_jobs.',
			inputSchema: {
				companyId: z.string().min(1).describe('Company ID returned by search_jobs'),
				jobId: z.string().min(1).describe('Job ID returned by search_jobs'),
			},
		},
		async ({ companyId, jobId }) => {
			const job = await publicJobsService.getJobDetails(companyId, jobId)
			if (!job) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ error: 'job_not_found', message: 'Job not found or no longer open.' }),
						},
					],
					isError: true,
				}
			}
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ job }, null, 2),
					},
				],
			}
		},
	)

	if (authenticatedUid) {
		server.registerTool(
			'start_interview',
			{
				title: 'Start a job interview on Coploy',
				annotations: SAFE_WRITE,
				_meta: { 'openai/widgetAccessible': true },
				description:
					'Prepare the AI interview for a specific job on Coploy for the authenticated candidate. ' +
					'On Coploy there is no "application" step: the candidate opens the interview link and records an AI-led interview. ' +
					'Use when the user wants to go for / start / do the interview for a job. Requires companyId and jobId from search_jobs. ' +
					'Returns interviewUrl — ALWAYS give this link to the user and make clear the interview is recorded in the browser, not in this chat. ' +
					'Safe to call again for the same job: it resumes the existing interview instead of duplicating it.',
				inputSchema: {
					companyId: z.string().min(1).describe('Company ID returned by search_jobs'),
					jobId: z.string().min(1).describe('Job ID returned by search_jobs'),
				},
			},
			async ({ companyId, jobId }) => {
				if (!features.motor) return notAvailable('motor')
				const result = await interviewsService.startInterview(authenticatedUid, companyId, jobId)
				if (!result) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({ error: 'job_not_found', message: 'Job not found or no longer open.' }),
							},
						],
						isError: true,
					}
				}
				// Sem structuredContent: esta tool não tem widget; o widget de vagas
				// já conhece o interviewUrl (determinístico) e usa o dele no fallback.
				return {
					content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
				}
			},
		)

		server.registerTool(
			'get_my_profile',
			{
				title: 'Get my Coploy profile',
				annotations: READ_ONLY,
				description:
					'Show the authenticated candidate\'s Coploy résumé: what is filled in, what is missing, the completeness score, ' +
					'and the status of their profile interview. ' +
					'This profile always belongs to the person you are talking to, whatever name it carries — a name that does not match ' +
					'is a name to offer to fix, never a sign that you are looking at someone else\'s résumé. ' +
					'On Coploy, a candidate who completes the AI profile interview becomes visible to companies that are hunting for talent. ' +
					'Use `nextStep` to guide the user: complete_profile → gather the missing information CONVERSATIONALLY (one open question, ' +
					'or offer \'send me your CV / paste your LinkedIn\') and save it with import_profile — never interrogate field by field; ' +
					'start_profile_interview → call start_profile_interview; finish_profile_interview → send them the interviewUrl. ' +
					'`askAbout` is the ONLY thing you may ask for; the rest is deliberately not exposed to you, and ' +
					'`remainingCount` is there so you can say "a couple more details" without naming them. ' +
					'Reciting everything the person still owes is the same form fatigue that makes candidates quit, ' +
					'and an incomplete résumé that exists beats a perfect one that was abandoned. ' +
					'When `offerForm` is true, close the SAME message by offering complete_my_profile as the ' +
					'fill-it-in-by-clicking alternative — some people will never type it out, and for them the short form is the only path.',
				inputSchema: {},
			},
			async () => {
				const overview = await profileService.getOverview(authenticatedUid)
				// A forma do payload é o que segura o comportamento, não a prosa.
				//
				// Primeiro mandamos a lista achatada: o modelo enumerava tudo e a
				// resposta virava checklist. Separamos em askAbout + alsoMissing
				// pedindo pra não ler o segundo: num perfil de 32% ele leu os cinco
				// assim mesmo. Instrução nenhuma segura dado que está no payload,
				// então o resto simplesmente não vai — só a contagem, que deixa
				// dizer "faltam mais alguns detalhes" sem transformar em cobrança.
				//
				// A lista inteira continua existindo pro widget (complete_my_profile),
				// onde ela é campo de formulário e não frase.
				const { missingFields, ...rest } = overview
				// Sem Motor não há entrevista de perfil para propor: o próximo passo
				// para ao completar o currículo, e o assistente sabe por quê.
				if (!features.motor && rest.nextStep === 'start_profile_interview') rest.nextStep = 'done'
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(
								{
									...rest,
									...(features.motor ? {} : { motorAvailable: false, motorNote: NOT_AVAILABLE.motor.message }),
									askAbout: missingFields.slice(0, 2),
									remainingCount: Math.max(0, missingFields.length - 2),
									offerForm: missingFields.length > 0,
								},
								null,
								2,
							),
						},
					],
				}
			},
		)

		server.registerTool(
			'update_my_profile',
			{
				title: 'Update my Coploy profile',
				annotations: SAFE_WRITE,
				description:
					'Create or update the authenticated candidate\'s Coploy résumé. ' +
					'Only send fields the user actually provided — omitted fields keep their current value. ' +
					'A richer profile is what makes the candidate findable by companies hunting talent on Coploy, ' +
					'so use this whenever the conversation reveals new professional information. ' +
					'For work history, studies, languages and certifications use add_profile_entry instead.',
				inputSchema: {
					name: z.string().min(2).optional().describe('The candidate\'s name — use it to fix a wrong or missing name on the profile'),
					occupation: z.string().optional().describe('Current or target role, e.g. "Full Stack Developer"'),
					level: z.string().optional().describe('Seniority: Júnior, Pleno, Sênior...'),
					headline: z.string().max(200).optional().describe('One-line pitch, LinkedIn style'),
					summary: z.string().max(4000).optional().describe('Professional summary'),
					yearsOfExperience: z.number().int().min(0).max(70).optional(),
					skills: z.array(z.string()).max(100).optional().describe('Technologies and competencies'),
					location: z.string().optional().describe('City/state or "Remote"'),
					countryOfResidence: z.string().optional().describe('ISO-2 country code, e.g. "BR"'),
					countriesOfInterest: z
						.array(z.string())
						.optional()
						.describe('ISO-2 codes of countries where the candidate would work'),
					professionalObjectives: z.string().max(4000).optional().describe('Career goals'),
					company: z.string().optional().describe('Current company'),
					linkedinUrl: z.string().optional(),
					phone: z.string().optional(),
					bio: bioSchema.optional(),
					skillDetails: skillDetailsSchema.optional(),
					workModalities: workModalitiesSchema.optional(),
					availability: availabilitySchema.optional(),
				},
			},
			async (fields) => {
				const provided = Object.fromEntries(
					Object.entries(fields).filter(([, value]) => value !== undefined),
				)
				if (Object.keys(provided).length === 0) {
					return {
						content: [
							{ type: 'text', text: JSON.stringify({ error: 'no_fields', message: 'Send at least one field to update.' }) },
						],
						isError: true,
					}
				}
				const result = await profileService.saveProfile(authenticatedUid, provided)
				return {
					content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
					...(result.ok ? {} : { isError: true as const }),
				}
			},
		)

		server.registerTool(
			'import_profile',
			{
				title: 'Import a full résumé into Coploy',
				annotations: SAFE_WRITE,
				description:
					'Fill the candidate\'s Coploy résumé in ONE call from free-form material. Use it whenever you have a chunk of ' +
					'career information: the user told their story in a message, attached a CV (read the file and structure it), ' +
					'or pasted their LinkedIn profile text. ' +
					'PREFER THIS over asking field by field — long questionnaires are where candidates give up. ' +
					'Ask one open question ("tell me about your career so far") or offer "send me your CV / paste your LinkedIn", ' +
					'then structure everything you got and send it here at once. ' +
					'Safe to call repeatedly: list entries are appended and de-duplicated, and text fields only fill what is still empty — ' +
					'importing never overwrites what the person wrote themselves. ' +
					'After importing, call get_my_profile to see what is still missing and ask only for that.',
				inputSchema: {
					occupation: z.string().optional().describe('Current or target role'),
					level: z.string().optional().describe('Seniority: Júnior, Pleno, Sênior...'),
					headline: z.string().max(200).optional(),
					summary: z.string().max(4000).optional().describe('Professional summary in the candidate\'s own voice'),
					yearsOfExperience: z.number().int().min(0).max(70).optional(),
					location: z.string().optional(),
					countryOfResidence: z.string().optional().describe('ISO-2, e.g. "BR"'),
					professionalObjectives: z.string().max(4000).optional(),
					company: z.string().optional().describe('Current company'),
					linkedinUrl: z.string().optional().describe('LinkedIn profile URL, if mentioned'),
					countriesOfInterest: z
						.array(z.string())
						.optional()
						.describe('ISO-2 codes of countries where the candidate would work'),
					bio: bioSchema.optional(),
					skills: z.array(z.string()).max(100).optional(),
					skillDetails: skillDetailsSchema.optional(),
					workModalities: workModalitiesSchema.optional(),
					availability: availabilitySchema.optional(),
					experiences: z
						.array(
							z.object({
								title: z.string().optional(),
								company: z.string().optional(),
								location: z.string().optional(),
								startDate: z.string().optional().describe('YYYY-MM'),
								endDate: z.string().optional().describe('YYYY-MM; omit if current'),
								current: z.boolean().optional(),
								description: z.string().optional(),
								skills: z.array(z.string()).optional(),
							}),
						)
						.max(50)
						.optional()
						.describe('Work history — send every job you learned about'),
					education: z
						.array(
							z.object({
								institution: z.string().optional(),
								degree: z.string().optional(),
								fieldOfStudy: z.string().optional(),
								startDate: z.string().optional(),
								endDate: z.string().optional(),
								current: z.boolean().optional(),
							}),
						)
						.max(30)
						.optional(),
					languages: z
						.array(
							z.object({
								language: z.string(),
								proficiency: z
									.enum(['basic', 'intermediate', 'advanced', 'fluent', 'native'])
									.optional(),
							}),
						)
						.max(20)
						.optional(),
					certifications: z
						.array(
							z.object({
								name: z.string().optional(),
								issuer: z.string().optional(),
								issueDate: z.string().optional(),
								credentialUrl: z.string().optional(),
							}),
						)
						.max(50)
						.optional(),
				},
			},
			async (imported) => {
				const provided = Object.fromEntries(
					Object.entries(imported).filter(([, value]) => value !== undefined),
				)
				if (Object.keys(provided).length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									error: 'nothing_to_import',
									message: 'Send the career information you gathered.',
								}),
							},
						],
						isError: true,
					}
				}
				const result = await profileService.importProfile(authenticatedUid, provided)
				return {
					content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
					...(result.ok ? {} : { isError: true as const }),
				}
			},
		)

		server.registerTool(
			'add_profile_entry',
			{
				title: 'Add an entry to my Coploy résumé',
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
				description:
					'Append ONE work experience, education, language or certification. ' +
					'Use for a single item that came up later in the conversation — for several at once, or for a CV / LinkedIn paste, ' +
					'use import_profile instead (one call, no interrogation).',
				inputSchema: {
					type: z
						.enum(['experience', 'education', 'language', 'certification'])
						.describe('What kind of entry to add'),
					title: z.string().optional().describe('experience: job title'),
					company: z.string().optional().describe('experience: company name'),
					institution: z.string().optional().describe('education: school/university'),
					degree: z.string().optional().describe('education: degree, e.g. "Bacharelado"'),
					fieldOfStudy: z.string().optional().describe('education: field of study'),
					location: z.string().optional(),
					startDate: z.string().optional().describe('YYYY-MM'),
					endDate: z.string().optional().describe('YYYY-MM; omit when ongoing'),
					current: z.boolean().optional().describe('true when it is the current job/course'),
					description: z.string().max(2000).optional(),
					skills: z.array(z.string()).optional().describe('experience: technologies used'),
					language: z.string().optional().describe('language: e.g. "Inglês"'),
					proficiency: z
						.enum(['basic', 'intermediate', 'advanced', 'fluent', 'native'])
						.optional()
						.describe('language: proficiency level'),
					name: z.string().optional().describe('certification: name'),
					issuer: z.string().optional().describe('certification: issuing organization'),
					issueDate: z.string().optional().describe('certification: YYYY-MM'),
					credentialUrl: z.string().optional(),
				},
			},
			async ({ type, ...entry }) => {
				const listByType = {
					experience: 'experiences',
					education: 'education',
					language: 'languages',
					certification: 'certifications',
				} as const
				const item = Object.fromEntries(
					Object.entries(entry).filter(([, value]) => value !== undefined),
				)
				if (Object.keys(item).length === 0) {
					return {
						content: [
							{ type: 'text', text: JSON.stringify({ error: 'empty_entry', message: 'Provide the entry fields.' }) },
						],
						isError: true,
					}
				}
				const result = await profileService.appendToList(authenticatedUid, listByType[type], item)
				return {
					content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
					...(result.ok ? {} : { isError: true as const }),
				}
			},
		)

		server.registerTool(
			'complete_my_profile',
			{
				title: 'Complete my Coploy profile',
				annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
				_meta: {
					'openai/outputTemplate': PROFILE_GAPS_WIDGET_URI,
					// o form salva chamando import_profile a partir do iframe
					'openai/widgetAccessible': true,
					'openai/toolInvocation/invoking': 'Abrindo seu perfil',
					'openai/toolInvocation/invoked': 'Perfil aberto',
				},
				description:
					'Show a short form with ONLY the résumé fields still missing, so the candidate can fill them by clicking instead of typing. ' +
					'Use when the user prefers to fill things in themselves, or after a conversational import to wrap up the last details. ' +
					'Do NOT use it as the first move: ask an open question or offer \'send me your CV\' first — this is the finishing touch, not the entry point.',
				inputSchema: {},
			},
			async () => {
				const overview = await profileService.getOverview(authenticatedUid)
				const language = normalizeProfileLanguage(
					await candidateAuthService.getUserLanguage(authenticatedUid),
				)
				const payload = {
					completeness: overview.completeness,
					missingFields: overview.missingFields,
					language: language ?? 'pt-BR',
					// O arquivo do currículo não entra por campo de texto: o formulário
					// mostra o caminho (mesma página que get_resume_upload_link devolve).
					resumeUploadUrl:
						features.candidateApp && env.CANDIDATE_APP_URL
							? `${env.CANDIDATE_APP_URL.replace(/\/+$/, '')}/profile`
							: null,
				}
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(payload, null, 2),
						},
					],
					structuredContent: payload,
				}
			},
		)

		server.registerTool(
			'start_profile_interview',
			{
				title: 'Start my Coploy profile interview',
				annotations: SAFE_WRITE,
				description:
					'Prepare the candidate\'s AI profile interview on Coploy — the interview that makes them visible to companies hunting for talent, ' +
					'without applying to any specific job. Coploy generates questions tailored to the given occupation and level. ' +
					'Ask the user for occupation and level before calling. It is free and idempotent: calling it again returns the existing interview. ' +
					'Returns interviewUrl — ALWAYS give this link to the user; the interview is recorded in the browser, not in this chat.',
				inputSchema: {
					occupation: z.string().min(2).describe('Target role, e.g. "Full Stack Developer"'),
					level: z.string().min(2).describe('Seniority, e.g. "Júnior", "Pleno", "Sênior"'),
					language: z.string().optional().describe('Interview language (defaults to the profile language)'),
					objectives: z
						.string()
						.max(2000)
						.optional()
						.describe('Career objectives — personalize the generated questions'),
				},
			},
			async (params) => {
				if (!features.motor) return notAvailable('motor')
				const result = await profileService.startProfileInterview(authenticatedUid, params)
				if (!result.ok) {
					return {
						content: [
							{ type: 'text', text: JSON.stringify({ error: 'profile_interview_failed', message: result.message }) },
						],
						isError: true,
					}
				}
				return {
					content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
				}
			},
		)

		/*
		 * O arquivo do currículo não trafega por aqui — e a tool existe justamente
		 * para dizer isso, em vez de o assistente prometer o que não consegue.
		 *
		 * O MCP troca JSON, e o host entrega ao modelo o TEXTO extraído do PDF, não
		 * os bytes. Quando alguém "manda o currículo" no chat, o conteúdo entra bem
		 * pelo import_profile (cargo, experiências, formação) — o ARQUIVO fica na
		 * conversa. É por isso que `resumeUrl` era o único campo que ninguém
		 * preenchia pelo assistente, e o perfil parava a 4 pontos do fim sem que o
		 * modelo soubesse dizer por quê.
		 */
		server.registerTool(
			'get_resume_upload_link',
			{
				title: 'Enviar o arquivo do currículo',
				annotations: READ_ONLY,
				description:
					'Return the link where the candidate uploads their résumé FILE (PDF). ' +
					'You cannot receive or forward a file yourself: when someone attaches a CV you get the extracted text, ' +
					'which belongs in import_profile — the file itself never reaches Coploy through this conversation. ' +
					'Call this when the profile still has no résumé file and the person wants the original attached, ' +
					'or when they say they are sending their CV as a file. ' +
					'Say plainly that you saved what the CV SAYS and that the file itself is uploaded on that page — ' +
					'never claim to have received or stored an attachment.',
				inputSchema: {},
			},
			async () => {
				if (!features.candidateApp || !env.CANDIDATE_APP_URL) return notAvailable('candidateApp')
				return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({
							uploadUrl: `${env.CANDIDATE_APP_URL.replace(/\/+$/, '')}/profile`,
							/* o modelo precisa saber POR QUE manda um link, senão inventa um motivo */
							why: 'The résumé file cannot travel through this chat; it is uploaded on the candidate area.',
							alreadySaved:
								'Text pasted or extracted from a CV is already stored through import_profile.',
						}),
					},
				],
				}
			},
		)
		server.registerTool(
			'get_my_insights',
			{
				title: 'What my interviews say about me',
				annotations: READ_ONLY,
				description:
					'Career insights drawn from the candidate\'s own completed interviews: how they communicate ' +
					'(structure, examples, depth — ranked against THEMSELVES, never against a bar), which competencies keep showing up ' +
					'as a strength or as room to grow, and practical suggestions. ' +
					'Use when the user asks how they are doing, what to improve, how to prepare for a next interview, or wants to ' +
					'practise. ' +
					'This is deliberately NOT an evaluation: there is no score, no approved/rejected and no fit-for-the-vacancy — ' +
					'that verdict belongs to the recruiter who requested the interview. What is here describes the person\'s own ' +
					'behaviour, which is what they can actually work on. ' +
					'Do not just read the fields out loud: explain what each one means for them and offer to rehearse the weakest one ' +
					'right here in the chat. `interviewsAnalyzed: 0` means there is nothing to observe yet — invite them to record ' +
					'their profile interview instead of inventing advice.',
				inputSchema: {},
			},
			async () => {
				const insights = await interviewsService.getInsights(authenticatedUid)
				if (!insights) {
					return {
						content: [
							{ type: 'text', text: JSON.stringify({ error: 'insights_unavailable' }) },
						],
						isError: true,
					}
				}
				return {
					content: [{ type: 'text', text: JSON.stringify(insights, null, 2) }],
				}
			},
		)

		server.registerTool(
			'get_my_interviews',
			{
				title: 'List my interviews on Coploy',
				annotations: READ_ONLY,
				description:
					'List the authenticated candidate\'s interviews on Coploy, split by nature. ' +
					'`profileInterview` is the one they created about their own career — it is what makes them visible to companies ' +
					'hunting for talent, and there is no company hiring on the other side. `companyInterviews` are the ones they ' +
					'recorded after being invited to a real job. Never call the profile one an application. ' +
					'Each entry carries progress and, when finished, `feedback` — what was observed in their answers. ' +
					'There is no score, no pass/fail and no fit-for-the-job here, by design: that is the recruiter\'s decision, not the ' +
					'candidate\'s to see. Open links already carry the session, so hand them over as-is.',
				inputSchema: {},
			},
			async () => {
				const interviews = await interviewsService.listMyInterviews(authenticatedUid)
				return {
					content: [{ type: 'text', text: JSON.stringify(interviews, null, 2) }],
				}
			},
		)
	}

	return server
}
