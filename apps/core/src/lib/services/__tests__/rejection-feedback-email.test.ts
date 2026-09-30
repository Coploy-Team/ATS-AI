import {
	createRejectionFeedbackEmailSender,
	type RejectionFeedbackEmailClient,
} from '../rejection-feedback-email'

describe('createRejectionFeedbackEmailSender', () => {
	let emailClient: jest.Mocked<RejectionFeedbackEmailClient>

	beforeEach(() => {
		emailClient = {
			sendEmail: jest.fn().mockResolvedValue({
				MessageID: 'postmark-message-1',
				SubmittedAt: '2026-08-12T10:00:00.000Z',
				To: 'ana@example.com',
				ErrorCode: 0,
				Message: 'OK',
			}),
		}
	})

	it('omits the review link for human rejection decisions', async () => {
		await createRejectionFeedbackEmailSender(emailClient).send({
			candidate: { email: 'ana@example.com', name: 'Ana Silva' },
			message: 'Obrigado por participar.',
			jobName: 'Engenheira',
			companyName: 'Coploy',
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			rejectionDecisionSource: 'manual',
		})

		expect(emailClient.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				htmlBody: expect.not.stringContaining('Pedir revisão humana'),
				textBody: expect.not.stringContaining('/revisao'),
			}),
		)
	})

	it('includes the review link for automated knockout decisions', async () => {
		await createRejectionFeedbackEmailSender(emailClient).send({
			candidate: { email: 'ana@example.com', name: 'Ana Silva' },
			message: 'Obrigado por participar.',
			jobName: 'Engenheira',
			companyName: 'Coploy',
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			rejectionDecisionSource: 'knockout',
		})

		expect(emailClient.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				htmlBody: expect.stringContaining(
					'/careers/company-1/jobs/job-1/applications/app-1/revisao',
				),
				textBody: expect.stringContaining('Pedir revisão humana:'),
			}),
		)
		expect(emailClient.sendEmail.mock.calls[0][0].textBody).toContain('/careers/company-1/jobs/job-1/applications/app-1/revisao')
	})
})
