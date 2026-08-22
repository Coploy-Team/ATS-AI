import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import type { CompanyInterview } from '@coploy/domain'

// Cache system for approved candidates
type ApprovedCacheEntry = {
	data: number
	timestamp: number
	expiresAt: number
}

const approvedCache = new Map<string, ApprovedCacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper function to get cache key for approved candidates
function getApprovedCacheKey(companyId: string): string {
	return `approved-candidates:${companyId}`
}

// Helper function to get cached approved candidates data
function getCachedApprovedData(key: string): number | null {
	const entry = approvedCache.get(key)
	if (!entry) {
		return null
	}

	if (Date.now() > entry.expiresAt) {
		approvedCache.delete(key)
		return null
	}

	return entry.data
}

// Helper function to set cached approved candidates data
function setCachedApprovedData(key: string, data: number): void {
	const now = Date.now()
	approvedCache.set(key, {
		data,
		timestamp: now,
		expiresAt: now + CACHE_TTL,
	})
}

// Helper function to clean expired cache entries
function cleanExpiredApprovedCache(): void {
	const now = Date.now()
	for (const [key, entry] of approvedCache.entries()) {
		if (now > entry.expiresAt) {
			approvedCache.delete(key)
		}
	}
}

// Optimized function to fetch approved candidates count
async function fetchApprovedCandidatesCount(
	companyId: string,
	listCompanyInterviews: (companyId: string, options?: object) => Promise<unknown[]>,
): Promise<number> {
	// Get all interviews for the company with approved status filter
	const approvedInterviews = (await listCompanyInterviews(
		companyId,
		{
			filters: [
				{
					field: 'candidate_status',
					operator: '==',
					value: 'Approved',
				},
				{
					field: 'finished',
					operator: '==',
					value: true,
				},
			],
			limitTo: 1000, // Limit to avoid performance issues
		},
	)) as CompanyInterview[]

	return approvedInterviews.length
}

// Get all candidates count
export function getCandidateCount(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/candidates/count',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Get all candidates count',
					response: {
						200: z.number(),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()

				const jobs = (await interviewsService.listCompanyInterviews(
					company.id,
					{
						filters: [
							{
								field: 'finished',
								operator: '==',
								value: true,
							},
						],
					},
				)) as CompanyInterview[]

				// Contar nomes únicos (distinct)
				const uniqueNames = new Set(jobs.map((job) => job.name))
				const totalCandidates = uniqueNames.size

				return totalCandidates
			},
		)
}

// Get all candidates approved (optimized with cache and companyInterviews)
export function getApprovedCandidatesCount(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/candidates/approved/count',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Get all candidates approved count (cached for 1 hour)',
					description:
						'Retorna a quantidade total de candidatos com status "Approved". Os dados são cacheados por 1 hora para melhor performance.',
					response: {
						200: z.number(),
					},
				},
			},
			async (request) => {
				// Clean expired cache entries periodically
				cleanExpiredApprovedCache()

				const userMembership = await request.getUserMembership()
				const { company } = userMembership
				const companyId = company.id

				const cacheKey = getApprovedCacheKey(companyId)

				// Check cache first
				const cachedData = getCachedApprovedData(cacheKey)
				if (cachedData !== null) {
					return cachedData
				}

				// Fetch fresh data
				const totalApproved = await fetchApprovedCandidatesCount(companyId, interviewsService.listCompanyInterviews.bind(interviewsService))

				// Cache the result
				setCachedApprovedData(cacheKey, totalApproved)

				return totalApproved
			},
		)
}
