import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { GlobalSearch } from '@/components/global-search'

import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/**
 * Shell full-width: sidebar como painel flutuante inset no desktop e DRAWER
 * no mobile (< lg), topbar fundida ao fundo, main fluida.
 */
export function Shell() {
	const [collapsed, setCollapsed] = useState(false)
	const [drawerOpen, setDrawerOpen] = useState(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	// Navegou no mobile → fecha o drawer (senão o menu cobre a tela nova).
	useEffect(() => setDrawerOpen(false), [pathname])

	/*
	 * ⌘K global. Escuta na janela porque o atalho tem que valer de qualquer
	 * lugar — inclusive com o foco dentro de uma tabela ou de um card. Só o
	 * campo de texto é exceção: lá o atalho do navegador é mais útil.
	 */
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
			event.preventDefault()
			setSearchOpen((open) => !open)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	return (
		<div className='relative isolate flex h-screen gap-0 overflow-hidden bg-bg text-text lg:gap-3 lg:p-3'>
			{/*
			 * O mesmo brilho do login vive no app, NOS DOIS TEMAS.
			 *
			 * Ele era `dark:` only porque a lime pura mancha o branco. A camada e a
			 * dose agora vêm de token (`--glow-layer`): o claro usa um radial que
			 * dissolve na borda — círculo chapado sobre branco vira mancha com
			 * contorno — e o escuro segue no círculo sólido de sempre.
			 *
			 * z-0 + isolate no pai: fica ATRÁS dos componentes; antes vazava por
			 * cima da tabela esverdeando o conteúdo.
			 */}
			<div
				className='pointer-events-none absolute -right-40 -top-40 z-0 hidden h-[520px] w-[520px] rounded-full blur-3xl lg:block'
				style={{ background: 'var(--glow-layer)', opacity: 'var(--glow-opacity)' }}
			/>

			{/* backdrop do drawer */}
			{drawerOpen && (
				<button
					aria-hidden
					tabIndex={-1}
					onClick={() => setDrawerOpen(false)}
					className='fixed inset-0 z-30 bg-black/40 lg:hidden'
				/>
			)}

			<div
					className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:z-10 lg:translate-x-0 ${
						drawerOpen ? 'translate-x-0' : '-translate-x-full'
					}`}
				>
				<Sidebar
					collapsed={collapsed}
					onToggleCollapsed={() => setCollapsed((c) => !c)}
					mobile={drawerOpen}
				/>
			</div>

			<div className='relative z-10 flex min-w-0 flex-1 flex-col'>
				<Topbar onOpenMenu={() => setDrawerOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
				<main className='flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto'>
					<Outlet />
				</main>
			</div>

			<GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
		</div>
	)
}
