import {
	ChangeAction,
	ChangeResourceRecordSetsCommand,
	type ChangeResourceRecordSetsRequest,
} from '@aws-sdk/client-route-53'
import { clientAws } from '@/config/aws-config'
import { env } from '@/env'

export async function addCNAMERecord(subdomain: string, target: string) {
	const hostedZoneId = env.AWS_HOSTED_ZONE_ID as string | undefined

	const params: ChangeResourceRecordSetsRequest = {
		HostedZoneId: hostedZoneId,
		ChangeBatch: {
			Changes: [
				{
					Action: ChangeAction.UPSERT,
					ResourceRecordSet: {
						Name: subdomain,
						Type: 'CNAME',
						TTL: 300,
						ResourceRecords: [{ Value: target }],
					},
				},
			],
		},
	}

	const command = new ChangeResourceRecordSetsCommand(params)
	await clientAws().send(command)
}
