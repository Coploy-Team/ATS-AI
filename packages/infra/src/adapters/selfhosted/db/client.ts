import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as documentsSchema from './schema/documents'
import * as tablesSchema from './schema/tables'

const schema = { ...documentsSchema, ...tablesSchema }

export type PostgresConfig = {
	url: string
	ssl?: boolean
}

export function createPgPool(config: PostgresConfig): Pool {
	return new Pool({
		connectionString: config.url,
		ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
	})
}

export function createDrizzleDb(pool: Pool) {
	return drizzle(pool, { schema })
}

export type DrizzleDb = ReturnType<typeof createDrizzleDb>
