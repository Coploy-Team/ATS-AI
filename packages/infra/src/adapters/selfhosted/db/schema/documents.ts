import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const infraMigrations = pgTable(
	'schema_migrations',
	{
		id: text('id').primaryKey(),
		appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
	},
)
