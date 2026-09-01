import { useTranslation } from 'react-i18next'

import { Badge } from '@/ui/badge'

export type JobStatus = 'aberta' | 'pausada' | 'arquivada'

const TONE: Record<JobStatus, 'lime' | 'amber' | 'neutral'> = {
	aberta: 'lime',
	pausada: 'amber',
	arquivada: 'neutral',
}

const LABEL_KEY: Record<JobStatus, string> = {
	aberta: 'jobs.statusOpen',
	pausada: 'jobs.statusPaused',
	arquivada: 'jobs.statusArchived',
}

export function StatusBadge({ status }: { status: JobStatus }) {
	const { t } = useTranslation()
	return <Badge tone={TONE[status]}>{t(LABEL_KEY[status])}</Badge>
}
