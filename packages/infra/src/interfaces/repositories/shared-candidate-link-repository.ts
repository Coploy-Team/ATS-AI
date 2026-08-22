import type { CreateInput, SharedCandidateLink } from '@coploy/domain';

export interface SharedCandidateLinkRepository {
	create(
		data: CreateInput<SharedCandidateLink>,
	): Promise<SharedCandidateLink & { code: string }>;
	getByCode(code: string): Promise<SharedCandidateLink | null>;
};
