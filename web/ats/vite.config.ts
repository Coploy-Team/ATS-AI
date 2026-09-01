import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	/*
	 * `loadEnv` em vez de `process.env`: o Vite NÃO injeta os arquivos .env no
	 * process do config, então `VITE_API_PROXY_TARGET` escrito num .env.local era
	 * silenciosamente ignorado e o dev continuava batendo em homolog — o pior tipo
	 * de bug de ambiente, porque a tela carrega e parece certa.
	 */
	const env = loadEnv(mode, __dirname, '')

	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: { '@': resolve(__dirname, 'src') },
			// ⚠️ Obrigatório: a raiz do monorepo tem React 18 hoisted (outras web apps)
			// e o 19 fica aninhado aqui — sem dedupe o app quebra em "Invalid hook
			// call" (gotcha reproduzido no web/candidate).
			dedupe: ['react', 'react-dom'],
		},
		server: {
			// Dev contra homolog sem CORS: VITE_API_CORE_URL=/core-api no .env e o
			// proxy encaminha pro LB (o CORS do core homolog não conhece :5177).
			// VITE_API_PROXY_TARGET=http://localhost:3333 aponta pro core local.
			proxy: {
				'/core-api': {
					target: env.VITE_API_PROXY_TARGET || 'https://api-hml.coploy.io',
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/core-api/, ''),
				},
			},
		},
	}
})
