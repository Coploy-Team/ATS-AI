export type PubSubAdapter = {
	ensureTopicExists(topicName: string): Promise<void>

	publish(
		topic: string,
		payload: unknown,
		attributes?: Record<string, string>,
	): Promise<string>

	sendFailedTaskMessage(
		payload: unknown,
		reason?: string,
		service?: string,
		operation?: string,
	): Promise<string>
}
