import { Route53Client } from '@aws-sdk/client-route-53'
import { env } from '@/env'

export function clientAws() {
	return new Route53Client({ region: env.AWS_REGION as string })
}
