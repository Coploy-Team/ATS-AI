import { useParams } from '@tanstack/react-router'

import { PipelinePage } from '@/features/pipeline/pipeline-page'

import { JobCandidatesList } from './job-candidates-list'

/**
 * As abas da vaga são adaptadores finos.
 *
 * Cada uma pega o `jobId` da rota e entrega para a tela que já existe. Manter a
 * tela genérica e o adaptador burro é o que permite o Pipeline continuar
 * funcionando em `/pipeline` (link antigo) e dentro da vaga sem duas cópias.
 */
export function JobPipelineTab() {
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	return <PipelinePage jobId={jobId} />
}

export function JobCandidatesTab() {
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	return <JobCandidatesList jobId={jobId} />
}
