import type { ListOptions } from '@coploy/domain'
import type { CompanyNotification, CreateInput, NotificationMessage, UpdateInput } from '@coploy/domain'

export type NotificationRepository = {
	listCompanyNotifications(companyId: string, options?: ListOptions): Promise<CompanyNotification[]>
	getCompanyNotification(companyId: string, id: string): Promise<CompanyNotification | null>
	createCompanyNotification(companyId: string, data: CreateInput<CompanyNotification>): Promise<CompanyNotification & { id: string }>
	updateCompanyNotification(companyId: string, id: string, data: UpdateInput<CompanyNotification>): Promise<void>
	deleteCompanyNotification(companyId: string, id: string): Promise<void>
	listNotificationMessages(companyId: string, options?: ListOptions): Promise<NotificationMessage[]>
	getNotificationMessage(companyId: string, id: string): Promise<NotificationMessage | null>
	createNotificationMessage(companyId: string, data: CreateInput<NotificationMessage>, customId?: string): Promise<NotificationMessage & { id: string }>
	updateNotificationMessage(companyId: string, id: string, data: UpdateInput<NotificationMessage>): Promise<void>
	deleteNotificationMessage(companyId: string, id: string): Promise<void>
}