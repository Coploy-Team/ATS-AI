export type CreateTaskOptions = {
	scheduleInSeconds?: number
	taskId?: string
}

export type QueueAdapter = {
	ensureQueueExists(): Promise<void>

	createTask(
		path: string,
		payload: unknown,
		options?: CreateTaskOptions,
	): Promise<string>

	getQueueInfo(): Promise<string>

	getFailedTasks(): Promise<{ count: number; details: string[] }>
}
