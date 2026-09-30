import type { ListOptions } from '@coploy/domain';
import type { CreateInput, ShortLink, UpdateInput } from '@coploy/domain';

export interface ShortLinkRepository {
	getShortLink(code: string): Promise<ShortLink | null>;
	listShortLinks(options?: ListOptions): Promise<ShortLink[]>;
	createShortLink(
		code: string,
		data: CreateInput<ShortLink>,
	): Promise<ShortLink & { id: string }>;
	updateShortLink(code: string, data: UpdateInput<ShortLink>): Promise<void>;
};