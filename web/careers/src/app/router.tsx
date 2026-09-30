import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ApplicationsPage } from '@/pages/applications'
import { ApplyPage } from '@/pages/apply'
import { CareersPage } from '@/pages/careers'
import { ImportProfilePage } from '@/pages/import-profile'
import { JobPage } from '@/pages/job'
import { LandingPage } from '@/pages/landing'

/**
 * Superfície 100% pública — não existe guarda de auth aqui.
 *
 * A conta de candidato só aparece DENTRO do fluxo de candidatura; navegar,
 * ler vaga e compartilhar link nunca pedem login. É o inverso do `web/ats`
 * (tudo atrás de sessão de recrutador) — e é por isso que são apps separados.
 */
function Shell() {
	const { t } = useTranslation()
	return (
		/*
		 * O shell trabalha em FAIXAS full-width, não num cartão centrado: o
		 * banner da empresa corre de borda a borda (como um site dela, que é o
		 * que o portal finge ser) e cada página decide a largura do próprio
		 * conteúdo. Container fixo aqui era o que dava o ar de protótipo.
		 */
		<div className='flex min-h-dvh flex-col bg-bg text-text'>
			<main className='flex-1'>
				<Outlet />
			</main>
			<footer className='border-t border-border bg-surface py-5 text-center text-[11.5px] text-muted'>
				{t('landing.poweredBy')}
			</footer>
		</div>
	)
}

const rootRoute = createRootRoute({ component: Shell })

const landingRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: LandingPage,
})

/*
 * FORA do escopo de empresa de propósito: o candidato pode ter processos em
 * mais de uma empresa da mesma instância, e o acompanhamento é dele.
 */
const applicationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/minhas-candidaturas',
	component: ApplicationsPage,
})

const careersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/$companyId',
	component: CareersPage,
})

const jobRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/$companyId/vagas/$jobId',
	component: JobPage,
})

const applyRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/$companyId/vagas/$jobId/candidatar',
	component: ApplyPage,
})

/*
 * Callback do OAuth de import de perfil OTS. ANTES das rotas de empresa: o
 * caminho é fixo e não pode ser engolido pelo `/$companyId`.
 */
const importProfileRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/importar-perfil',
	component: ImportProfilePage,
})

const routeTree = rootRoute.addChildren([
	landingRoute,
	applicationsRoute,
	importProfileRoute,
	careersRoute,
	jobRoute,
	applyRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
