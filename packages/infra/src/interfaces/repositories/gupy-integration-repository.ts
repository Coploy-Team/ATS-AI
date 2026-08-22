import type { CreateInput, GupyIntegration, UpdateInput } from '@coploy/domain';

export type GupyIntegrationRepository = {
	listGupyIntegrations(companyId: string): Promise<GupyIntegration[]>;
	getGupyIntegration(id: string): Promise<GupyIntegration | null>;
	createGupyIntegration(
		data: CreateInput<GupyIntegration>,
		customId?: string,
	): Promise<GupyIntegration & { id: string }>;
	updateGupyIntegration(
		id: string,
		data: UpdateInput<GupyIntegration>,
	): Promise<void>;
};