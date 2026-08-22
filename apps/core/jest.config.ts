import type { Config } from 'jest'

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	rootDir: 'src',
	moduleNameMapper: {
		// @/ → apps/core/src/* (rootDir is apps/core/src)
		'^@/(.*)$': '<rootDir>/$1',
		// @coploy/* → monorepo packages (rootDir/../../.. = monorepo root)
		'^@coploy/infra$': '<rootDir>/../../../packages/infra/src',
		'^@coploy/shared$': '<rootDir>/../../../packages/shared/src',
		'^@coploy/firebase$': '<rootDir>/../../../packages/firebase/src',
	},
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
	},
	setupFiles: ['<rootDir>/lib/services/__tests__/jest.setup.ts'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	clearMocks: true,
}

export default config
