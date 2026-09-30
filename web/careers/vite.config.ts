import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, __dirname, '')

	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: { '@': resolve(__dirname, 'src') },
			// ⚠️ Obrigatório: a raiz do monorepo tem React 18 hoisted (outras web
			// apps) e o 19 fica aninhado aqui — sem dedupe o app quebra em
			// "Invalid hook call" (gotcha reproduzido no web/candidate).
			dedupe: ['react', 'react-dom'],
		},
		server: {
			proxy: {
				'/core-api': {
					target: env.VITE_API_PROXY_TARGET || 'http://localhost:3333',
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/core-api/, ''),
				},
			},
		},
	}
})
