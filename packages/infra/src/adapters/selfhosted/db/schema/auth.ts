import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const authUsers = pgTable(
	'auth_user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		phoneNumber: text('phone_number'),
		banned: boolean('banned'),
		banReason: text('ban_reason'),
		banExpires: timestamp('ban_expires', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		emailIdx: uniqueIndex('auth_user_email_idx').on(table.email),
		phoneIdx: index('auth_user_phone_idx').on(table.phoneNumber),
	}),
)

export const authSessions = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		token: text('token').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
		activeOrganizationId: text('active_organization_id'),
	},
	(table) => ({
		tokenIdx: uniqueIndex('auth_session_token_idx').on(table.token),
		userIdx: index('auth_session_user_id_idx').on(table.userId),
	}),
)

export const authAccounts = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		providerAccountIdx: uniqueIndex('auth_account_provider_account_idx').on(table.providerId, table.accountId),
		userIdx: index('auth_account_user_id_idx').on(table.userId),
	}),
)

export const authVerifications = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		identifierIdx: index('auth_verification_identifier_idx').on(table.identifier),
		valueIdx: index('auth_verification_value_idx').on(table.value),
	}),
)

export const authJwks = pgTable(
	'jwks',
	{
		id: text('id').primaryKey(),
		publicKey: text('public_key').notNull(),
		privateKey: text('private_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
	},
	(table) => ({
		createdAtIdx: index('auth_jwks_created_at_idx').on(table.createdAt),
		expiresAtIdx: index('auth_jwks_expires_at_idx').on(table.expiresAt),
	}),
)
