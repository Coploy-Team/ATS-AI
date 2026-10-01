import { useTranslation } from 'react-i18next'
import {
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	redirect,
} from '@tanstack/react-router'

import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'
import { LoginPage } from '@/features/auth/login-page'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'
import { SignupPage } from '@/features/auth/signup-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { ehConvidado, papelGarantido } from '@/lib/guest'
import { GuestLayout } from '@/features/share/guest-layout'
import { SharedCandidatePage } from '@/features/share/shared-candidate-page'
import { SharedPage } from '@/features/share/shared-page'
import { JobLayout } from '@/features/job/job-layout'
import { JobCandidatesTab, JobPipelineTab } from '@/features/job/job-tabs'
import { ShareTab } from '@/features/job/share-tab'
import { CandidatePage } from '@/features/candidate/candidate-page'
import { AnalyticsPage } from '@/features/analytics/analytics-page'
import { HuntingPage } from '@/features/hunting/hunting-page'
import { TalentPage } from '@/features/hunting/talent-page'
import { IntegrationsPage } from '@/features/integrations/integrations-page'
import { ServerPage } from '@/features/server/server-page'
import { ProfilePage } from '@/features/profile/profile-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { TeamPage } from '@/features/team/team-page'
import { CandidatesPage } from '@/features/candidates/candidates-page'
import { JobOverviewPage } from '@/features/job-overview/job-overview-page'
import { JobTemplatesPage } from '@/features/job-templates/job-templates-page'
import { ReportsPage } from '@/features/reports/reports-page'
import { InterviewsPage } from '@/features/interviews/interviews-page'
import { PortalPage } from '@/features/portal/portal-page'
import { ProcessSettingsPage } from '@/features/process/process-settings-page'
import { JobTeamPage } from '@/features/job-team/job-team-page'
import { JobInterviewPage } from '@/features/job-interview/job-interview-page'
import { JobConfigPage } from '@/features/job-config/job-config-page'
import { JobFormPage } from '@/features/job-form/job-form-page'
import { EmailTemplatesPage } from '@/features/emails/email-templates-page'
import { RequisitionsPage } from '@/features/requisitions/requisitions-page'
import { FormsPage, StructurePage } from '@/features/structure/structure-page'
import { JobsPage } from '@/features/jobs/jobs-page'
import { CreditsPage } from '@/features/saas'
import { getAuth } from '@/lib/auth'
import { ensureMembership, resetMembership } from '@/lib/require-membership'
import { limparSessao } from '@/lib/session-reset'
import { ScreenGuard } from '@/components/screen-guard'

import { Shell } from './shell'

const rootRoute = createRootRoute({ component: Outlet })


const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
	/*
	 * Guarda PARA ONDE a pessoa estava indo.
	 *
	 * Sem isso, quem clicava no link de compartilhamento sem estar logado caía no
	 * login, entrava, e ia parar no dashboard — o código do link ficava para
	 * trás. Ela precisava voltar ao e-mail e clicar de novo, e um convidado nem
	 * dashboard tem para onde ir.
	 */
	validateSearch: (search: Record<string, unknown>): { destino?: string; motivo?: string } => ({
		...(typeof search.destino === 'string' ? { destino: search.destino } : {}),
		...(typeof search.motivo === 'string' ? { motivo: search.motivo } : {}),
	}),
	beforeLoad: ({ search }) => {
		if (getAuth().isAuthenticated()) {
			throw redirect({ to: (search.destino as string) ?? '/dashboard' })
		}
	},
})

const signupRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/criar-conta',
	component: SignupPage,
	beforeLoad: () => {
		if (getAuth().isAuthenticated()) throw redirect({ to: '/dashboard' })
	},
})

/*
 * Recuperação de senha: duas telas públicas.
 *
 * `/redefinir-senha` NÃO redireciona quem já está logado — o link chega por
 * e-mail e pode ser aberto num navegador com sessão viva; mandar essa pessoa
 * para o dashboard engoliria o pedido que ela acabou de fazer.
 */
const forgotPasswordRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/esqueci-senha',
	component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/redefinir-senha',
	component: ResetPasswordPage,
})

/** Layout autenticado: tudo que vive dentro do shell exige sessão de empresa. */
/*
 * O convidado de revisão vive FORA do shell.
 *
 * Não é detalhe de layout: dentro dele o app pintava menu, busca e barra e só
 * então descobria o papel, apagando tudo meio segundo depois. Aqui não existe
 * nada para esconder.
 */
const guestRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'guest',
	component: GuestLayout,
	beforeLoad: ({ location }) => {
		if (!getAuth().isAuthenticated()) {
			throw redirect({ to: '/login', search: { destino: location.href } })
		}
	},
})

const sharedRoute = createRoute({
	getParentRoute: () => guestRoute,
	path: '/compartilhado',
	component: SharedPage,
	validateSearch: (search: Record<string, unknown>) => ({ s: (search.s as string) ?? '' }),
})

const sharedCandidateRoute = createRoute({
	getParentRoute: () => guestRoute,
	path: '/compartilhado/$userId',
	component: SharedCandidatePage,
	validateSearch: (search: Record<string, unknown>) => ({ s: (search.s as string) ?? '' }),
})

const appRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'app',
	component: Shell,
	beforeLoad: async ({ location }) => {
		if (!getAuth().isAuthenticated()) {
			throw redirect({ to: '/login', search: { destino: location.href } })
		}
		/*
		 * Sessão sem VÍNCULO com empresa (conta de candidato, por exemplo) não
		 * é sessão do ATS: derruba e explica no login — renderizar a casca
		 * quebrada era o "fica preso" do teste do plugin (2026-08-24).
		 */
		if ((await ensureMembership()) === 'no-access') {
			try {
				limparSessao()
				await getAuth().logout()
			} catch {
				/* sessão já inválida no servidor — o redirect resolve */
			}
			resetMembership()
			throw redirect({ to: '/login', search: { motivo: 'sem-acesso' } })
		}
		/*
		 * Convidado não entra no produto, e a decisão é ANTES de montar — checar
		 * depois, com um efeito, é o que fazia o menu piscar. `papelGarantido`
		 * busca o papel se ainda não souber: só o valor lembrado deixava passar o
		 * primeiro acesso, quando o localStorage está vazio.
		 */
		if (ehConvidado(await papelGarantido())) {
			throw redirect({ to: '/compartilhado', search: { s: '' } })
		}
	},
})

const indexRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/',
	beforeLoad: () => {
		throw redirect({ to: '/dashboard' })
	},
})

/**
 * Porta de entrada.
 *
 * Entrar na lista de vagas respondia "o que existe"; quem loga precisa saber
 * como está a operação — o que estourou prazo, o que ficou sem régua, o que foi
 * publicado e não recebeu ninguém.
 */
const dashboardRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/dashboard',
	component: DashboardPage,
})

const jobsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/vagas',
	component: JobsPage,
})

const interviewsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/entrevistas',
	component: InterviewsPage,
})

/**
 * `/requisicoes` virou `/pedidos-de-vaga`.
 *
 * O redirecionamento fica: existe link salvo e favorito, e quebrar não ganha
 * nada. Mesma decisão de `/configuracao` → `/processo`.
 */
const requisitionsLegacyRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/requisicoes',
	beforeLoad: () => {
		throw redirect({ to: '/pedidos-de-vaga' })
	},
})

const templatesRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/modelos',
	component: JobTemplatesPage,
})

/*
 * Os recortes do acervo.
 *
 * Rotas próprias, e não abas dentro de /modelos, porque cada uma é uma ENTRADA
 * do menu: quem clica em "Descrições" tem que cair já filtrado, e o endereço
 * precisa ser compartilhável. O componente é o mesmo — muda o ângulo.
 */
const templateDescriptionsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/modelos/descricoes',
	component: () => <JobTemplatesPage recorte='descricoes' />,
})

const templateProcessesRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/modelos/processos',
	component: () => <JobTemplatesPage recorte='processos' />,
})

const templateScriptsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/modelos/roteiros',
	component: () => <JobTemplatesPage recorte='roteiros' />,
})

const jobNewRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/vagas/nova',
	/*
	 * `requisicao` e `titulo` chegam da tela de Requisições: o formulário nasce
	 * com o cargo pedido e devolve o id na criação, que é onde o servidor marca
	 * a requisição como consumida.
	 */
	validateSearch: (
		search: Record<string, unknown>,
	): {
		requisicao?: string
		titulo?: string
		modelo?: string
		entrevista?: 'sim' | 'nao'
	} => ({
		requisicao: typeof search.requisicao === 'string' ? search.requisicao : undefined,
		titulo: typeof search.titulo === 'string' ? search.titulo : undefined,
		/* modelo escolhido em /modelos — preenche o formulário e some da URL depois */
		modelo: typeof search.modelo === 'string' ? search.modelo : undefined,
		/*
		 * Qual porta a pessoa escolheu na lista: com o Motor ou sem. Ausente = a
		 * instalação decide — sem o Motor não há escolha a fazer.
		 */
		entrevista:
			search.entrevista === 'sim' || search.entrevista === 'nao'
				? (search.entrevista as 'sim' | 'nao')
				: undefined,
	}),
	component: JobFormPage,
})

const jobEditRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/vagas/$jobId/editar',
	component: () => <JobFormPage mode='edit' />,
})

/**
 * A casa da vaga.
 *
 * `/vagas/:id` era a única entidade sem rota própria — clicar numa vaga levava
 * a `/pipeline?vaga=id`, uma seção do menu que pedia a vaga de novo. As
 * ferramentas viram abas dentro da vaga.
 */
const jobRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/vagas/$jobId',
	component: JobLayout,
})

/** Entrar na vaga cai no quadro: é o que o recrutador quer ver primeiro. */
const jobIndexRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/',
	/*
	 * ⚠️ Mudou: antes caía direto no quadro.
	 *
	 * Aquela decisão foi tomada quando a vaga não tinha capa — o quadro era o
	 * único lugar com informação. Agora rascunho abriria num quadro vazio por
	 * definição, e vaga pausada não contaria por que parou. A visão geral leva
	 * ao quadro num clique e é a única tela que serve aos quatro estados.
	 */
	beforeLoad: ({ params }) => {
		throw redirect({ to: '/vagas/$jobId/visao-geral', params })
	},
})

const jobOverviewRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/visao-geral',
	component: JobOverviewPage,
})

/**
 * A aba do Motor.
 *
 * A ROTA existe sempre — quem tem o link ou o favorito não pode cair em erro.
 * Quem some é a aba no cabeçalho, e a própria tela explica que a instalação não
 * tem o plugin.
 */
const jobInterviewRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/entrevista',
	component: JobInterviewPage,
})

const jobTeamRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/time',
	component: JobTeamPage,
})

/**
 * `/configuracao` virou `/processo`.
 *
 * O redirecionamento fica: existe link antigo salvo, e-mail com a URL e
 * favorito — quebrar isso não ganha nada.
 */
const jobConfigLegacyRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/configuracao',
	beforeLoad: ({ params }) => {
		throw redirect({ to: '/vagas/$jobId/processo', params })
	},
})

const jobProcessRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/processo',
	component: JobConfigPage,
})

const jobPipelineRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/pipeline',
	component: JobPipelineTab,
	// a ordem continua na URL: recarregar não pode devolver o board para uma
	// ordenação que o recrutador não escolheu
	validateSearch: (search: Record<string, unknown>): { ordem?: string } => ({
		ordem: typeof search.ordem === 'string' ? search.ordem : undefined,
	}),
})

const jobCandidatesRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/candidatos',
	component: JobCandidatesTab,
})

const jobShareRoute = createRoute({
	getParentRoute: () => jobRoute,
	path: '/divulgacao',
	component: ShareTab,
})

const candidateRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/vagas/$jobId/candidatos/$candidateId',
	component: CandidatePage,
})

const candidatesRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/candidatos',
	/*
	 * `busca` na URL: a busca global manda para cá quando a pessoa encontrada não
	 * tem vaga resolvida, e a tela precisa abrir já filtrada. De brinde, o
	 * recrutador consegue salvar/compartilhar uma busca.
	 */
	validateSearch: (search: Record<string, unknown>): { busca?: string } => ({
		busca: typeof search.busca === 'string' && search.busca ? search.busca : undefined,
	}),
	component: CandidatesPage,
})

const requisitionsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/pedidos-de-vaga',
	component: () => (
		<ScreenGuard path='/pedidos-de-vaga'>
			<RequisitionsPage />
		</ScreenGuard>
	),
})

const portalRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/portal-de-vagas',
	component: () => (
		<ScreenGuard path='/portal-de-vagas'>
			<PortalPage />
		</ScreenGuard>
	),
})

const processSettingsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/processo-seletivo',
	component: () => (
		<ScreenGuard path='/processo-seletivo'>
			<ProcessSettingsPage />
		</ScreenGuard>
	),
})

const communicationRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/comunicacao',
	component: () => (
		<ScreenGuard path='/comunicacao'>
			<EmailTemplatesPage />
		</ScreenGuard>
	),
})

/* Endereço antigo: estava em favorito e em link colado. Redireciona, não some. */
const emailsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/emails',
	beforeLoad: () => {
		throw redirect({ to: '/comunicacao' })
	},
})

const formsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/formularios',
	component: () => (
		<ScreenGuard path='/formularios'>
			<FormsPage />
		</ScreenGuard>
	),
})

const reportsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/relatorios',
	component: () => (
		<ScreenGuard path='/relatorios'>
			<ReportsPage />
		</ScreenGuard>
	),
})

const structureRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/estrutura',
	component: () => (
		<ScreenGuard path='/estrutura'>
			<StructurePage />
		</ScreenGuard>
	),
})

const analyticsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/analytics',
	component: AnalyticsPage,
})

const teamRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/time',
	component: () => (
		<ScreenGuard path='/time'>
			<TeamPage />
		</ScreenGuard>
	),
})

const creditsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/creditos',
	component: () => (
		<ScreenGuard path='/creditos'>
			<CreditsPage />
		</ScreenGuard>
	),
})

const serverRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/servidor',
	component: () => (
		<ScreenGuard path='/servidor'>
			<ServerPage />
		</ScreenGuard>
	),
})

const integrationsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/integracoes',
	component: () => (
		<ScreenGuard path='/integracoes'>
			<IntegrationsPage />
		</ScreenGuard>
	),
})

const settingsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/configuracoes',
	component: () => (
		<ScreenGuard path='/configuracoes'>
			<SettingsPage />
		</ScreenGuard>
	),
})

const huntingRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/hunting',
	component: () => (
		<ScreenGuard path='/hunting'>
			<HuntingPage />
		</ScreenGuard>
	),
})


const talentRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/hunting/$userId',
	component: TalentPage,
})

const profileRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/perfil',
	component: ProfilePage,
})

/**
 * `/pipeline` sobrevive como compatibilidade.
 *
 * O Pipeline saiu do menu e virou aba da vaga, mas o endereço antigo está em
 * link salvo, aba aberta e histórico de gente — some sem aviso seria quebrar o
 * caminho de quem já usava. Com vaga na query, redireciona para dentro dela;
 * sem vaga, não há para onde ir a não ser a lista.
 */
const pipelineRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/pipeline',
	beforeLoad: ({ search }) => {
		const vaga = (search as { vaga?: string }).vaga
		throw vaga
			? redirect({ to: '/vagas/$jobId/visao-geral', params: { jobId: vaga } })
			: redirect({ to: '/vagas' })
	},
	// a vaga vai na URL: sem isto o board sempre abria na primeira da lista,
	// então "abrir pipeline" a partir de uma vaga caía em outra
	// a ordem vai na URL junto da vaga: recarregar não pode devolver o board
	// para uma ordenação que o recrutador não escolheu
	validateSearch: (search: Record<string, unknown>): { vaga?: string; ordem?: string } => ({
		vaga: typeof search.vaga === 'string' ? search.vaga : undefined,
		ordem: typeof search.ordem === 'string' ? search.ordem : undefined,
	}),
})

const routeTree = rootRoute.addChildren([
	guestRoute.addChildren([sharedRoute, sharedCandidateRoute]),
	loginRoute,
	signupRoute,
	forgotPasswordRoute,
	resetPasswordRoute,
	appRoute.addChildren([
		indexRoute,
		dashboardRoute,
		jobsRoute,
		jobNewRoute,
		templatesRoute,
		interviewsRoute,
		requisitionsLegacyRoute,
		requisitionsRoute,
		structureRoute,
		portalRoute,
		processSettingsRoute,
		emailsRoute,
		communicationRoute,
		formsRoute,
		reportsRoute,
		templateDescriptionsRoute,
		templateProcessesRoute,
		templateScriptsRoute,
		jobEditRoute,
		jobRoute.addChildren([
			jobIndexRoute,
			jobPipelineRoute,
			jobCandidatesRoute,
			jobOverviewRoute,
			jobProcessRoute,
			jobConfigLegacyRoute,
			jobTeamRoute,
			jobInterviewRoute,
			jobShareRoute,
		]),
		candidateRoute,
		candidatesRoute,
		analyticsRoute,
		teamRoute,
		creditsRoute,
		integrationsRoute,
		serverRoute,
		settingsRoute,
		profileRoute,
		huntingRoute,
		talentRoute,
		pipelineRoute,
	]),
])

/**
 * 404 com saída.
 *
 * O default do router é um "Not Found" cru: sem shell, sem navegação, sem cor —
 * quem chega ali por link velho ou URL trocada fica sem caminho de volta e
 * acha que o app quebrou. Fora do `appRoute` não há sidebar, então a tela
 * precisa carregar o link de volta ela mesma.
 */
function NotFoundPage() {
	const { t } = useTranslation()

	return (
		<div className='flex h-dvh flex-col items-center justify-center gap-3 bg-surface text-center'>
			<p className='font-display text-[15px] font-semibold'>{t('notFound.title')}</p>
			<p className='max-w-[340px] text-[12.5px] leading-snug text-text-2'>
				{t('notFound.hint')}
			</p>
			<Link
				to='/vagas'
				className='rounded-lg border border-lime bg-lime px-3 py-1.5 text-[12.5px] font-medium text-lime-ink'
			>
				{t('notFound.action')}
			</Link>
		</div>
	)
}

export const router = createRouter({ routeTree, defaultNotFoundComponent: NotFoundPage })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
