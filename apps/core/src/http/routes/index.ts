import type { FastifyInstance } from 'fastify'
import { registerRbac } from '@/http/plugins/rbac'
import { authenticateWithPassword } from './auth/authenticate-with-password'
import { authenticateWithPhone } from './auth/authenticate-with-phone'
import { checkEmailExists } from './auth/check-email-exists'
import { checkRecruiter } from './auth/check-recruiter'
import { getProfile } from './auth/get-profile'
import { passwordRoutes } from './auth/password-routes'
import { updateProfileEmpresa } from './auth/update-profile-empresa'
import { refreshToken } from './auth/refresh-token'
import { candidateMe } from './auth/candidate-me'
import { checkPhoneExists } from './auth/check-phone'
import { createCandidate } from './auth/create-candidate'
import { updateCandidatePhoto, updateCandidateResume, updateCandidateProfile as updateAuthProfile } from './auth/update-candidate'
import { careersRoutes } from './careers/jobs'
import { applyLiteRoutes } from './careers/apply-lite'
import { uploadCandidateResume } from './careers/upload-resume'
import { rejectionReviewCandidateRoutes } from './careers/rejection-review'
import { submitScreeningKnockoutRoutes } from './careers/screening-knockout'
// Billing
import { createCollaborator } from './companies/collaborators/create-collaborator'
import { deleteCollaborator } from './companies/collaborators/delete-collaborator'
import { getCreators } from './companies/collaborators/get-creators'
import { getRejectionReasons } from './companies/rejection-reasons'
import { reengageCandidates } from './companies/jobs/reengage-candidates'
import { inviteInterview } from './companies/jobs/invite-interview'
import { getRanking } from './companies/jobs/get-ranking'
import { taxonomyRoutes } from './companies/taxonomy-routes'
import { recoveryRoutes } from './auth/recovery-routes'
import { retentionRoutes } from './settings/retention-routes'
import { instanceEmailRoutes } from './settings/instance-email'
import { instancePluginRoutes } from './settings/instance-plugin'
import { lgpdRoutes } from './dream-jobs/lgpd-routes'
import { importRoutes } from './settings/import-routes'
import { listWebhookEvents } from './settings/list-webhook-events'
import { huntingIntent } from './companies/hunting-intent'
import { emailTemplatePreview } from './companies/org/email-template-preview'
import { orgRoutes } from './companies/org/org-routes'
import { offerRoutes } from './companies/offers/offer-routes'
import { requisitionRoutes } from './companies/requisitions/requisition-routes'
import { timelineRoutes } from './companies/timeline/timeline-routes'
import { scorecardRoutes } from './companies/scorecards/scorecard-routes'
import { getCapabilities } from './companies/get-capabilities'
import { getCandidateDossier } from './companies/jobs/get-candidate-dossier'
import { requestCandidateProfile } from './companies/jobs/request-candidate-profile'
import { jobKnockoutRoutes } from './companies/jobs/knockout'
import { listCollaborators } from './companies/collaborators/list-collaborators'
import { updateCollaborator } from './companies/collaborators/update-collaborator'
import { createCompany } from './companies/create-company'
import { createCompanyFree } from './companies/create-company-free'
import { getCompany } from './companies/get-company'
import { rejectionReviewRecruiterRoutes } from './companies/rejection-review-requests'
import { aiDetection } from './companies/interviews/ai-detection'
import {
  getApprovedCandidatesCount,
  getCandidateCount,
} from './companies/interviews/candidates/get-cadidates'
import { getCandidateDetails } from './companies/interviews/candidates/get-candidate-details'
import { getCandidatesRanking } from './companies/interviews/candidates/get-candidates-ranking'
import { toggleCandidateLike } from './companies/interviews/candidates/toggle-candidate-like'
import { fastTrack } from './companies/interviews/fast-track'
import { getInterviews } from './companies/interviews/get-inteviews'
import { interviewTranslationRoutes } from './companies/interviews/translation'
import { processAuthenticityAnalysis } from './companies/interviews/process-authenticity-analysis'
import { updateInterview } from './companies/interviews/update-interview'
import { createJob } from './companies/jobs/create-job'
import { createShareLink } from './companies/jobs/create-share-link'
import { createHmReviewToken } from './companies/jobs/create-hm-review-token'
import { deleteJob } from './companies/jobs/delete-job'
import { countJobs, getInterviewsCount, getJob } from './companies/jobs/get-job'
import { getJobCandidates } from './companies/jobs/get-job-candidates'
import { getJobCandidatesByIds } from './companies/jobs/get-job-candidates-by-ids'
import { getJobs } from './companies/jobs/get-jobs'
import { createInfoJobs } from './companies/jobs/info-jobs/create-info-jobs'
import { deleteInfoJobs } from './companies/jobs/info-jobs/delete-info-jobs'
import { getInfoJobs } from './companies/jobs/info-jobs/get-info-jobs'
import { patchInfoJobs } from './companies/jobs/info-jobs/patch-info-jobs'
import { updateInfoJobs } from './companies/jobs/info-jobs/update-info-jobs'
import { patchJob } from './companies/jobs/patch-job'
import { updateJob } from './companies/jobs/update-job'
import { getShareLinkCandidates } from './companies/share-links/get-share-link-candidates'
import { getShareLinkCandidateDetail } from './companies/share-links/get-share-link-candidate-detail'
import { notificationsRoutes } from './companies/notifications/notifications'
import {
  createNotificationMessageRoutes,
  deleteNotificationMessageRoutes,
  getNotificationMessageRoutes,
  notificationsMessagesRoutes,
  updateNotificationMessageAllFieldsRoutes,
  updateNotificationMessageRoutes,
} from './companies/notifications/notificationsMessages'
import { patchCompany } from './companies/patch-company'
import { paises } from './companies/services/paises'
import { sendEmail } from './companies/services/send-email'
import { updateCompany } from './companies/update-company'
import { uploadCompanyLogo } from './companies/upload-company-logo'
import { getInterviewTestStatusMessage } from './comunication/get-interview-test-status-message'
// Conversation
import { createConversationContext } from './conversation/create-conversation-context'
import { getConversationContext } from './conversation/get-conversation-context'
import { getHome } from './dashboard/get-home'
import { getSourceBreakdown } from './dashboard/get-source-breakdown'
import { getFunnelBreakdown } from './dashboard/get-funnel-breakdown'
import { getInbox } from './dashboard/get-inbox'
import { getInsights } from './dashboard/get-insights'
import { getInterviewsByJob } from './dashboard/get-interviews-by-job'
import { getInterviewsByTime } from './dashboard/get-interviews-by-time'
import { getJobsPerformance } from './dashboard/get-jobs-performance'
import { getScoreDistribution } from './dashboard/get-score-distribution'
import { getRetro } from './dashboard/get-retro'
import { getRetroCoploy } from './dashboard/get-retro-coploy'
import { generateExcelReport, generateExcelReportByYear } from './dashboard/report/generate-excel-report'
import { checkInterviewStatus } from './dreamJobs/check-interview-status'
import { createCheckoutSessionDreamJobs } from './dreamJobs/create-checkout-session'
import { getInterviewDetails } from './dreamJobs/get-interview-details'
import { getCandidateProfile } from './dreamJobs/get-profile'
import { getSessionToken } from './dreamJobs/get-session-token'
import { linkInterview } from './dreamJobs/link-interview'
import { interviewHandoff } from './dreamJobs/interview-handoff'
import { provisionProfileInterview } from './dreamJobs/provision-interview'
import { updateInterviewProgress } from './dreamJobs/update-interview-progress'
import { updateCandidateProfile } from './dreamJobs/update-profile'
import { uploadCandidatePhoto } from './dreamJobs/upload-photo'
import { uploadResume } from './dreamJobs/upload-resume'
// import { debugFirestoreStructure } from './debug/firestore-structure' // DEBUG: removido
import { createNps } from './feedback/create-nps'
import { exportNps } from './feedback/export-nps'
import { getNps } from './feedback/get-nps'
import { createInterviewAbandonment } from './interviews/create-abandonment'
import { listMyInterviews } from './interviews/list-my-interviews'
import { otsAttestations } from './ots/attestations'
import { registerSaasInternalRoutes } from './saas-internal'
import { getMyInsights } from './interviews/get-my-insights'
import { generateJobDescription } from './ia/generate-job-description'
import { generateJobPostDescription } from './ia/generate-job-post-description'
import { generateEvaluationQuestions } from './ia/generate-evaluation-questions'
import { generateQuestions } from './ia/generate-questions'
import { generateScreeningDescription } from './ia/generate-screening-description'
import { generateScreeningQuestions } from './ia/generate-screening-questions'
import { generateSkillDescription } from './ia/generate-skill-description'
// Kanban
import { getKanbanColumns } from './companies/kanban/get-kanban-columns'
import { stageActionsRoutes } from './companies/kanban/stage-actions'
import { updateKanbanColumn } from './companies/kanban/update-kanban-column'
import { createKanbanColumn } from './companies/kanban/create-kanban-column'
import { deleteKanbanColumn } from './companies/kanban/delete-kanban-column'
import { getKanbanConfig } from './companies/kanban/get-kanban-config'
import { updateKanbanConfig } from './companies/kanban/update-kanban-config'
import { bulkUpdateStatus } from './companies/kanban/bulk-update-status'
// Integrations
import { getIntegrationUserJobApplied } from './integrations/get-user-job-applied'
import { createAuthenticatedInterviewUrl } from './integrations/create-authenticated-interview-url'
import { createJobPortal } from './job-portal/create-job-portal'
import { getJobPortal } from './job-portal/get-job-portal'
import { updateJobPortal } from './job-portal/update-job-portal'
import { uploadJobPortalMedia } from './job-portal/upload-job-portal-media'
import { getInterview } from './public/get-interview'
import { hmReviewPublicRoutes } from './public/hm-review'
import {
  getShortLinkData,
  redirectShortLink,
} from './public/redirect-shortlink'
import { getCandidateDetails as getPublicCandidateDetails } from './public_inteview/get-candidate-details'
import { getInterviews as getPublicInterviews } from './public_inteview/get-interviews'
import { getHuntingSummary } from './public_inteview/get-hunting-summary'
import { getUserJobApplied } from './users/get-user-job-applied'
// Upload
import { uploadFile } from './upload/upload-file'
// Storage (self-hosted presigned URLs)
import { presignedUpload } from './storage/presigned-upload'
// Admin
// Settings — Gupy Integration
import { listResultWebhooks } from './settings/list-result-webhooks'
import { getResultWebhook } from './settings/get-result-webhook'
import { createResultWebhook } from './settings/create-result-webhook'
import { updateResultWebhook } from './settings/update-result-webhook'
import { deleteResultWebhook } from './settings/delete-result-webhook'
import { testResultWebhook } from './settings/test-result-webhook'
import { listWebhookDeliveryLogs } from './settings/list-webhook-delivery-logs'
import { retryWebhookDelivery } from './settings/retry-webhook-delivery'

export function registerRoutes(app: FastifyInstance) {
  /*
   * RBAC antes de tudo: o hook é global e decide por `x-surface` + tabela de
   * política. Registrar aqui (e não em cada rota) é o que garante que rota
   * nova nasça coberta — esquecer o mapa cai no ramo `unmapped`, que loga e,
   * com enforcement ligado, bloqueia.
   */
  registerRbac(app, app.infra)

  //auth
  app.register(authenticateWithPassword)
  app.register(authenticateWithPhone)
  app.register(refreshToken)
  app.register(getProfile)
  app.register(updateProfileEmpresa)
  app.register(passwordRoutes)
  app.register(checkEmailExists)
  app.register(checkRecruiter)
  app.register(checkPhoneExists)
  app.register(createCandidate)
  app.register(candidateMe)
  app.register(updateCandidatePhoto)
  app.register(updateCandidateResume)
  app.register(updateAuthProfile)
  //companies
  app.register(getCompany)
  app.register(createCompany)
  app.register(createCompanyFree)
  app.register(updateCompany)
  app.register(patchCompany)
  app.register(uploadCompanyLogo)
  app.register(notificationsRoutes)
  app.register(notificationsMessagesRoutes)
  app.register(createNotificationMessageRoutes)
  app.register(updateNotificationMessageAllFieldsRoutes)
  app.register(updateNotificationMessageRoutes)
  app.register(deleteNotificationMessageRoutes)
  app.register(getNotificationMessageRoutes)
  //collaborators
  app.register(listCollaborators)
  app.register(createCollaborator)
  app.register(updateCollaborator)
  app.register(deleteCollaborator)
  app.register(getCreators)
  app.register(getRejectionReasons)
  app.register(inviteInterview)
  app.register(reengageCandidates)
  app.register(getCapabilities)
  app.register(scorecardRoutes)
  app.register(timelineRoutes)
  app.register(requisitionRoutes)
  app.register(offerRoutes)
  app.register(orgRoutes)
  app.register(emailTemplatePreview)
  app.register(huntingIntent)
  app.register(listWebhookEvents)
  app.register(importRoutes)
  app.register(lgpdRoutes)
  app.register(retentionRoutes)
  // tela Servidor (open): transporte de e-mail da instalação
  app.register(instanceEmailRoutes)
  app.register(instancePluginRoutes)
  app.register(recoveryRoutes)
  app.register(taxonomyRoutes)
  app.register(getRanking)
  app.register(getCandidateDossier)
  app.register(requestCandidateProfile)
  app.register(jobKnockoutRoutes)
  //jobs
  app.register(getJobs)
  app.register(getJob)
  app.register(getJobCandidates)
  app.register(getJobCandidatesByIds)
  app.register(createShareLink)
  app.register(createHmReviewToken)
  app.register(getShareLinkCandidates)
  app.register(getShareLinkCandidateDetail)
  app.register(countJobs)
  app.register(getInterviewsCount)
  app.register(createJob)
  app.register(updateJob)
  app.register(patchJob)
  app.register(deleteJob)
  app.register(getCandidateCount)
  app.register(getApprovedCandidatesCount)
  app.register(rejectionReviewRecruiterRoutes)
  //interviews
  app.register(getInterviews)
  app.register(getCandidatesRanking)
  app.register(getCandidateDetails)
  app.register(interviewTranslationRoutes)
  app.register(updateInterview)
  app.register(toggleCandidateLike)
  app.register(aiDetection)
  app.register(fastTrack)
  app.register(processAuthenticityAnalysis)
  //kanban
  app.register(getKanbanColumns)
  app.register(stageActionsRoutes)
  app.register(createKanbanColumn)
  app.register(updateKanbanColumn)
  app.register(deleteKanbanColumn)
  app.register(getKanbanConfig)
  app.register(updateKanbanConfig)
  app.register(bulkUpdateStatus)
  //infoJobs
  app.register(createInfoJobs)
  app.register(updateInfoJobs)
  app.register(patchInfoJobs)
  app.register(deleteInfoJobs)
  app.register(getInfoJobs)
  //dashboard
  app.register(getHome)
  app.register(getInterviewsByTime)
  app.register(getInterviewsByJob)
  app.register(getJobsPerformance)
  app.register(getScoreDistribution)
  app.register(getInsights)
  app.register(getInbox)
  app.register(getFunnelBreakdown)
  app.register(getSourceBreakdown)
  app.register(generateExcelReport)
  app.register(generateExcelReportByYear)
  app.register(getRetro)
  app.register(getRetroCoploy)
  //job portal
  app.register(getJobPortal)
  app.register(createJobPortal)
  app.register(updateJobPortal)
  app.register(uploadJobPortalMedia)
  app.register(getUserJobApplied)
  //services
  app.register(sendEmail)
  app.register(paises)
  //ia
  app.register(generateJobDescription)
  app.register(generateJobPostDescription)
  app.register(generateSkillDescription)
  app.register(generateQuestions)
  app.register(generateEvaluationQuestions)
  app.register(generateScreeningDescription)
  app.register(generateScreeningQuestions)
  //comunicação
  app.register(getInterviewTestStatusMessage)
  //conversation
  app.register(createConversationContext)
  app.register(getConversationContext)
  //public
  app.register(getInterview)
  app.register(hmReviewPublicRoutes)
  app.register(redirectShortLink)
  app.register(getShortLinkData)
  app.register(careersRoutes)
  app.register(applyLiteRoutes)
  app.register(uploadCandidateResume)
  app.register(submitScreeningKnockoutRoutes)
  app.register(rejectionReviewCandidateRoutes)
  //public_interviews
  app.register(getPublicInterviews)
  app.register(getPublicCandidateDetails)
  app.register(getHuntingSummary)
  //feedback
  app.register(createNps)
  app.register(getNps)
  app.register(exportNps)
  app.register(createInterviewAbandonment)
  // console interno + endpoints internos — ver saas-internal.ts
  registerSaasInternalRoutes(app)
  app.register(listMyInterviews)
  app.register(getMyInsights)
  // OTS 0.2 — attestation de entrevista verificada
  app.register(otsAttestations)
  //billing

  //dream jobs
  app.register(createCheckoutSessionDreamJobs)
  app.register(uploadResume)
  app.register(checkInterviewStatus)
  app.register(linkInterview)
  app.register(provisionProfileInterview)
  app.register(interviewHandoff)
  app.register(updateInterviewProgress)
  app.register(getCandidateProfile)
  app.register(updateCandidateProfile)
  app.register(uploadCandidatePhoto)
  app.register(getInterviewDetails)
  app.register(getSessionToken)
  //apagar essa rota: changePlanDate após os testes

  //integrations
  app.register(getIntegrationUserJobApplied)
  app.register(createAuthenticatedInterviewUrl)
  //upload
  app.register(uploadFile)
  //storage
  app.register(presignedUpload)
  //admin
  //settings — gupy integration
  //settings — result webhooks
  app.register(listResultWebhooks)
  app.register(getResultWebhook)
  app.register(createResultWebhook)
  app.register(updateResultWebhook)
  app.register(deleteResultWebhook)
  app.register(testResultWebhook)
  //settings — webhook delivery logs
  app.register(listWebhookDeliveryLogs)
  app.register(retryWebhookDelivery)
}
