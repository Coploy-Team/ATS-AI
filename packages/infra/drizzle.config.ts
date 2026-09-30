import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/adapters/selfhosted/db/schema/*.ts',
	out: './src/adapters/selfhosted/db/migrations',
	dbCredentials: {
		url: process.env.POSTGRES_URL ?? '',
	},
	strict: true,
	verbose: true,
})
