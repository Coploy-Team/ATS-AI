import type { Config } from 'jest'

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	rootDir: 'src',
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'^@coploy/infra$': '<rootDir>/../../../packages/infra/src',
		'^@coploy/infra/selfhosted$': '<rootDir>/../../../packages/infra/src/providers/selfhosted',
		'^@coploy/domain$': '<rootDir>/../../../packages/domain/src',
		'^@coploy/shared$': '<rootDir>/../../../packages/shared/src',
		'^@coploy/shared/env$': '<rootDir>/../../../packages/shared/src/env',
	},
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
	},
	setupFiles: ['<rootDir>/lib/services/__tests__/jest.setup.ts'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	clearMocks: true,
	forceExit: true,
}

export default config
