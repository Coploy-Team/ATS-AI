import { useTranslation } from 'react-i18next'

import { Badge } from '@/ui/badge'

export type JobStatus = 'rascunho' | 'aberta' | 'pausada' | 'arquivada'

const TONE: Record<JobStatus, 'lime' | 'amber' | 'neutral'> = {
	/* Neutro de propósito: rascunho não é estado de alerta, é trabalho em curso. */
	rascunho: 'neutral',
	aberta: 'lime',
	pausada: 'amber',
	arquivada: 'neutral',
}

const LABEL_KEY: Record<JobStatus, string> = {
	rascunho: 'jobs.statusDraft',
	aberta: 'jobs.statusOpen',
	pausada: 'jobs.statusPaused',
	arquivada: 'jobs.statusArchived',
}

export function StatusBadge({ status }: { status: JobStatus }) {
	const { t } = useTranslation()
	return <Badge tone={TONE[status]}>{t(LABEL_KEY[status])}</Badge>
}
