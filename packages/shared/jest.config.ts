import type { Config } from 'jest'

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	rootDir: 'src',
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
	},
	testMatch: ['**/__tests__/**/*.test.ts'],
	clearMocks: true,
}

export default config
