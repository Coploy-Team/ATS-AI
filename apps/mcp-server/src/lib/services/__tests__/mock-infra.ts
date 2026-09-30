import type { InfraProvider } from '@coploy/infra'

export function createMockInfra(): jest.Mocked<InfraProvider> {
	return {
		jobRepository: {
			getJob: jest.fn().mockResolvedValue(null),
			listJobs: jest.fn().mockResolvedValue([]),
			listPublicJobs: jest.fn().mockResolvedValue([]),
			createJob: jest.fn().mockResolvedValue({ id: 'test' }),
			updateJob: jest.fn().mockResolvedValue(undefined),
			deleteJob: jest.fn().mockResolvedValue(undefined),
			getInfoJobByPostJob: jest.fn().mockResolvedValue(null),
			syncPostJobUsersApplied: jest.fn().mockResolvedValue(undefined),
		},
		companyRepository: {
			getCompany: jest.fn().mockResolvedValue(null),
		},
		userRepository: {
			getUser: jest.fn().mockResolvedValue(null),
			getCandidateProfile: jest.fn().mockResolvedValue(null),
			findUserByEmail: jest.fn().mockResolvedValue(null),
			findUserByPhone: jest.fn().mockResolvedValue(null),
			createUser: jest.fn().mockImplementation((data, id) => Promise.resolve({ id, ...data })),
			updateUser: jest.fn().mockResolvedValue(undefined),
			deleteUser: jest.fn().mockResolvedValue(undefined),
		},
		candidateRepository: {
			getJobApplied: jest.fn().mockResolvedValue(null),
			listJobsApplied: jest.fn().mockResolvedValue([]),
			createJobApplied: jest.fn().mockResolvedValue({ id: 'test' }),
			updateJobApplied: jest.fn().mockResolvedValue(undefined),
		},
		auth: {
			verifyToken: jest.fn().mockResolvedValue({ uid: 'test-uid' }),
			createUser: jest.fn().mockResolvedValue({ uid: 'test-uid' }),
			getUserByEmail: jest.fn().mockResolvedValue(null),
			getUserByPhone: jest.fn().mockResolvedValue(null),
			deleteUser: jest.fn().mockResolvedValue(undefined),
			createCustomToken: jest.fn().mockResolvedValue('custom-token'),
			signInWithPassword: jest.fn().mockResolvedValue('test-token'),
			createUserAndGetToken: undefined,
			getUser: jest.fn().mockResolvedValue(null),
			updateUser: jest.fn().mockResolvedValue({ uid: 'test-uid' }),
		},
	} as unknown as jest.Mocked<InfraProvider>
}
