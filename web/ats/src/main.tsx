import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { router } from '@/app/router'
import { initAuthClient } from '@/lib/auth'
import '@/lib/i18n'
import { configureApi } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { TooltipProvider } from '@/ui/tooltip'
import './styles/tokens.css'

// Boot assíncrono: auth inicializada ANTES do router montar — as guardas de
// rota leem isAuthenticated() sincronamente, sem flash de tela errada.
initAuthClient().then(() => {
	configureApi()
	createRoot(document.getElementById('root')!).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<RouterProvider router={router} />
				</TooltipProvider>
			</QueryClientProvider>
		</StrictMode>,
	)
})
