export interface ShortLink {
	id: string
	code?: string | null
	originalUrl?: string | null
	jobId?: string | null
	companyId?: string | null
	createdAt?: Date | null
	clickCount?: number | null
	lastClickedAt?: Date | null
	utmSource?: string | null
	utmMedium?: string | null
	utmCampaign?: string | null
	utmContent?: string | null
}
