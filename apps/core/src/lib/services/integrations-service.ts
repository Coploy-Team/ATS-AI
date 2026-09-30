import type { InfraProvider } from '@coploy/infra'
import type { Company, JobApplied, User } from '@coploy/domain'
import type { CandidateLike } from '@coploy/domain'
import { toDate } from '@/lib/date-formatter'
import { deriveAuthenticityConfidence } from '@/lib/cheat-confidence'

function buildAvatarUrl(name: string): string {
  const parts = name.split(' ')
  const seed = `${parts.at(0)} ${parts.at(-1)}`
  return `https://api.dicebear.com/8.x/initials/png?backgroundColor=ffb4e7,ffea83,80e5f4,cdf784&fontFamily=sans-serif&fontSize=36&fontWeight=100&seed=${encodeURIComponent(seed)}`
}

function parseInterviewUrl(url: string): { jobId: string; companyId: string } | null {
  const match = /\/job\/([^/]+)\/company\/([^/]+)/.exec(url)
  if (!match) return null
  return { jobId: match[1], companyId: match[2] }
}

export function createIntegrationsService(infra: InfraProvider) {
  return {
    async getCompanyByApiKey(apiKey: string): Promise<Company | null> {
      const companies = await infra.companyRepository.listCompanies({
        filters: [{ field: 'apiKey', operator: '==', value: apiKey }],
        limitTo: 1,
      })
      return companies[0] ?? null
    },

    /**
     * Returns all data needed for the integrations/get-user-job-applied endpoint:
     * user, jobApplied, company, likes + calculated interviewProgress.
     * Returns null for user/jobApplied if not found (route handles 404).
     */
    async getUserJobApplied(userId: string, jobAppliedId: string) {
      const userData = (await infra.userRepository.getUser(userId)) as User | null
      if (!userData) return { found: false as const, entity: 'user' as const }

      const jobAppliedData = (await infra.candidateRepository.getJobApplied(
        userId,
        jobAppliedId,
      )) as JobApplied | null
      if (!jobAppliedData) return { found: false as const, entity: 'jobApplied' as const }

      const companyId = (jobAppliedData.companyOwner as { id?: string })?.id
      let companyData: Company | null = null
      if (companyId) {
        companyData = (await infra.companyRepository.getCompany(companyId)) as Company | null
      }

      const likes = (await infra.candidateRepository.listCandidateLikes(
        userId,
        jobAppliedId,
      )) as CandidateLike[]

      // Calculate interview progress
      const interviewProgress = {
        isFinished: jobAppliedData.finished,
        currentQuestion: 0,
        totalQuestions: 0,
        progress: '',
      }

      if (jobAppliedData.interview?.info && Array.isArray(jobAppliedData.interview.info)) {
        const questions = jobAppliedData.interview.info
        interviewProgress.totalQuestions = questions.length

        if (!jobAppliedData.finished) {
          const answeredQuestions = questions.filter((q) => q.finished === true).length
          interviewProgress.currentQuestion = answeredQuestions
          interviewProgress.progress = `${answeredQuestions}/${questions.length}`
        } else {
          interviewProgress.currentQuestion = questions.length
          interviewProgress.progress = `${questions.length}/${questions.length}`
        }
      } else if (jobAppliedData.finished) {
        interviewProgress.progress = 'Completo'
      }

      const jobAppliedResult = {
        id: jobAppliedId,
        appliedTime: toDate(jobAppliedData.appliedTime),
        companyOwner: jobAppliedData.companyOwner?.id ?? null,
        finishedTime: toDate(jobAppliedData.finishedTime),
        dateSelect: toDate(jobAppliedData.dateSelect),
        userApplied: jobAppliedData.userApplied?.id ?? null,
        jobApplied: jobAppliedData.jobApplied?.id ?? null,
        likes: likes.map((like) => ({
          ...like,
          created_at: toDate(like.created_at),
          action: like?.action ?? true,
        })),
        totalLikes: likes.filter((like) => like.action === true || like.action === undefined).length,
        totalDislikes: likes.filter((like) => like.action === false).length,
        exitJobResult: jobAppliedData.exitJobResult || null,
        interview: jobAppliedData.interview
          ? {
              ...jobAppliedData.interview,
              dateTime:
                typeof (jobAppliedData.interview.dateTime as unknown as { toDate?: () => Date })
                  .toDate === 'function'
                  ? toDate(jobAppliedData.interview.dateTime)!
                  : jobAppliedData.interview.dateTime,
              cheat: deriveAuthenticityConfidence(
                jobAppliedData.interview.cheat as Record<string, unknown> | null | undefined,
                (jobAppliedData.interview.info as Array<Record<string, unknown>>) ?? null,
              ),
            }
          : null,
        interviewProgress,
      }

      const userResult = {
        id: userData.id,
        uuid: userData.uuid,
        created_time: toDate(userData.created_time),
        display_name: userData.display_name,
        email: userData.email,
        phone_number: userData.phone_number,
        photo_url: userData.photo_url,
        language: userData.language,
        countryOfResidence: userData.countryOfResidence,
        countriesOfInterest: userData.countriesOfInterest,
        professionalObjectives: userData.professionalObjectives,
        resumeUrl: userData.resumeUrl,
        occupation: userData.occupation,
        level: userData.level,
        paymentDetails: userData.paymentDetails
          ? {
              stripeCustomerId: userData.paymentDetails.stripeCustomerId,
              paied: userData.paymentDetails.paied,
              paidDate: toDate(userData.paymentDetails.paidDate),
              messageError: userData.paymentDetails.messageError,
              dateError: toDate(userData.paymentDetails.dateError),
            }
          : undefined,
        dreamJobsInterview: userData.dreamJobsInterview
          ? {
              jobId: userData.dreamJobsInterview.jobId,
              jobAppliedId: userData.dreamJobsInterview.jobAppliedId,
              createdAt: toDate(userData.dreamJobsInterview.createdAt) ?? new Date(),
              status: userData.dreamJobsInterview.status,
              completedAt: toDate(userData.dreamJobsInterview.completedAt),
            }
          : undefined,
      }

      const companyResult = companyData
        ? {
            id: companyData.id,
            companyName: companyData.companyName,
            companLogo: companyData.companLogo,
            companyBio: companyData.companyBio,
            companyCity: companyData.companyCity,
            companyCountry: companyData.companyCountry,
            companyState: companyData.companyState,
            companySize: companyData.companySize,
            companyWebsite: companyData.companyWebsite,
            segment: companyData.segment,
            subscriptionStatus: companyData.subscriptionStatus,
            headquartersCountries: companyData.headquartersCountries,
          }
        : {
            id: companyId || '',
            companyName: undefined,
            companLogo: undefined,
            companyBio: undefined,
            companyCity: undefined,
            companyCountry: undefined,
            companyState: undefined,
            companySize: undefined,
            companyWebsite: undefined,
            segment: undefined,
            subscriptionStatus: undefined,
            headquartersCountries: undefined,
          }

      return {
        found: true as const,
        jobApplied: jobAppliedResult,
        users: userResult,
        company: companyResult,
      }
    },

    async createAuthenticatedInterviewUrl(params: {
      interviewUrl: string
      email: string
      name: string
      password: string
    }) {
      const parsed = parseInterviewUrl(params.interviewUrl)
      if (!parsed) {
        return {
          success: false as const,
          error: 'URL inválida. Formato esperado: .../job/{jobId}/company/{companyId}/...',
        }
      }

      let uid: string
      let isNewUser = false

      const existingUser = await infra.auth.getUserByEmail(params.email)

      if (existingUser) {
        uid = existingUser.uid
      } else {
        const userRecord = await infra.auth.createUser({
          email: params.email,
          password: params.password,
          displayName: params.name,
        })
        uid = userRecord.uid
        isNewUser = true

        await infra.userRepository.createUser(
          {
            display_name: params.name,
            email: params.email,
            phone_number: '',
            photo_url: buildAvatarUrl(params.name),
            created_time: new Date(),
            finished: false,
            testing: false,
          } as any,
          uid,
        )
      }

      const sessionToken = await infra.auth.createCustomToken(uid)

      const url = new URL(params.interviewUrl)
      url.searchParams.set('sessionToken', sessionToken)

      return {
        success: true as const,
        authenticatedUrl: url.toString(),
        userId: uid,
        isNewUser,
      }
    },
  }
}
