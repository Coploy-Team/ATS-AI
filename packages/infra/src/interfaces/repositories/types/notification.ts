export interface CompanyNotification {
	id: string
	title?: string | null
	message?: string | null
	status?: boolean | null
	read?: boolean | null
	dateTime?: Date | unknown | null
	type?: string | null
	actionRef?: string | null
	postId?: string | null
	jobId?: string | null
	image?: string | null
}

export interface NotificationMessage {
	id: string
	name?: string | null
	message?: string | null
	creator?: string | null
	created_at?: Date | null
}
