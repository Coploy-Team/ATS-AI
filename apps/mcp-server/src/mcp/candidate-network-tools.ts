import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
	ATTESTATION_CONSENT_SUMMARY,
	type CandidateNetworkService,
	PUBLIC_PROFILE_CONSENT_SUMMARY,
	SHOWCASE_CONSENT_SUMMARY,
} from '@/lib/services/candidate-network-service'

/**
 * Tools da rede do candidato (COP-22 / COP-12): projetos, perfil aberto,
 * vitrine por link, prova verificada (OTS) e portabilidade.
 *
 * Três regras, todas herdadas da tela:
 * - consentimento é ato explícito da pessoa — as tools de publicar exigem
 *   `accepted: true` e o roteiro manda ler o resumo antes;
 * - publicar passa pela MESMA curadoria (COP-14), porque é o core que a
 *   dispara; a tool devolve o estado e explica o que ele significa;
 * - nenhum caminho paralelo de escrita — cada tool chama a rota da área do
 *   candidato.
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const
const SAFE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const

type Locale = 'pt-BR' | 'en'

const CURATION_EXPLANATION: Record<Locale, Record<'approved' | 'pending' | 'rejected' | 'removed', string>> = {
	'pt-BR': {
		approved: 'No ar: passou pela análise automática e já aparece na página pública.',
		pending: 'Em análise: a checagem automática marcou algo ou não conseguiu concluir, e uma pessoa vai revisar. É sobre legalidade, não qualidade — não é uma recusa.',
		rejected: 'Recusado pela curadoria — o motivo está em reasons.',
		removed: 'Retirado do ar pela curadoria — o motivo está em reasons.',
	},
	en: {
		approved: 'Live: it passed the automatic check and is already on the public page.',
		pending: 'Under review: the automatic check flagged something or could not conclude, and a person will review. This is about legality, not quality — it is not a rejection.',
		rejected: 'Not approved by curation — see reasons.',
		removed: 'Taken down by curation — see reasons.',
	},
}

type CoreFailure = { ok: false; status: number; message: string }

function ok(payload: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}
function fail(result: CoreFailure, hint?: string) {
	return {
		content: [{
			type: 'text' as const,
			text: JSON.stringify({ error: result.status === 404 ? 'not_found' : 'core_error', status: result.status, message: result.message, ...(hint ? { hint } : {}) }),
		}],
		isError: true as const,
	}
}
function consentRequired() {
	return {
		content: [{
			type: 'text' as const,
			text: JSON.stringify({
				error: 'consent_required',
				message: 'Read the consent summary to the person and only call again with accepted: true after they explicitly agree to publish THIS item.',
			}),
		}],
		isError: true as const,
	}
}

export interface CandidateNetworkToolsDeps {
	server: McpServer
	network: CandidateNetworkService
	uid: string
	/** false = instalação sem a rede do candidato: as tools existem, mas explicam. */
	available: boolean
	notAvailable: () => { content: Array<{ type: 'text'; text: string }>; isError: true }
	locale: () => Promise<Locale>
}

export function registerCandidateNetworkTools({ server, network, uid, available, notAvailable, locale }: CandidateNetworkToolsDeps) {
	const guard = <T extends unknown[], R>(fn: (...args: T) => Promise<R>) =>
		async (...args: T) => (available ? fn(...args) : notAvailable())

	// ─── projetos ─────────────────────────────────────────────────────────
	server.registerTool(
		'get_my_projects',
		{
			title: 'List my portfolio projects on Coploy',
			annotations: READ_ONLY,
			description:
				'List the candidate\'s portfolio projects (title, description, type, link/repo, files) in display order. ' +
				'Projects are private until published to the public profile with publish_public_profile_item.',
			inputSchema: {},
		},
		guard(async () => {
			const result = await network.listProjects(uid)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	server.registerTool(
		'add_project',
		{
			title: 'Add a portfolio project on Coploy',
			annotations: SAFE_WRITE,
			description:
				'Add ONE project to the candidate\'s portfolio: a title, an optional description (write it here in the chat and ' +
				'have the person approve it first), and a link and/or repository URL. Images and PDF files can only be attached ' +
				'in the candidate area — say so instead of pretending to upload. Adding does not publish: offer publish_public_profile_item next.',
			inputSchema: {
				title: z.string().min(1).max(120),
				description: z.string().max(2000).optional(),
				type: z.enum(['link', 'repo', 'images', 'pdf']).describe('What the project mainly is'),
				link: z.string().url().optional().describe('Live URL (https)'),
				repo: z.string().url().optional().describe('Repository URL (https)'),
			},
		},
		guard(async (input) => {
			const result = await network.createProject(uid, input)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	server.registerTool(
		'update_project',
		{
			title: 'Update a portfolio project on Coploy',
			annotations: SAFE_WRITE,
			description: 'Change title, description, link or repository of ONE project (partial update — only the fields sent change).',
			inputSchema: {
				id: z.string().min(1).describe('Project id from get_my_projects'),
				title: z.string().min(1).max(120).optional(),
				description: z.string().max(2000).nullable().optional(),
				link: z.string().url().nullable().optional(),
				repo: z.string().url().nullable().optional(),
			},
		},
		guard(async ({ id, ...patch }) => {
			const result = await network.updateProject(uid, id, patch)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	server.registerTool(
		'remove_project',
		{
			title: 'Remove a portfolio project on Coploy',
			annotations: DESTRUCTIVE,
			description: 'Delete ONE project, with its files. Only after the person asked for it by name. If it was published, it leaves the public page too.',
			inputSchema: { id: z.string().min(1) },
		},
		guard(async ({ id }) => {
			const result = await network.deleteProject(uid, id)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	server.registerTool(
		'reorder_projects',
		{
			title: 'Reorder portfolio projects on Coploy',
			annotations: SAFE_WRITE,
			description: 'Set the display order of the projects: pass ALL ids in the wanted order (ids left out keep their place at the end).',
			inputSchema: { ids: z.array(z.string().min(1)).min(1).max(50) },
		},
		guard(async ({ ids }) => {
			const result = await network.reorderProjects(uid, ids)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	// ─── perfil aberto ────────────────────────────────────────────────────
	server.registerTool(
		'get_my_public_profile',
		{
			title: 'Get my public profile page on Coploy',
			annotations: READ_ONLY,
			description:
				'The candidate\'s public page (@handle): handle, visibility (available | open_to_talk | hidden), the items published ' +
				'so far with their curation state, the public URL, and the consent summary you must read before publishing anything. ' +
				'Publishable items: the résumé headline/summary/skills (type "profile"), each project (type "project", by projectId), ' +
				'each video answer of a finished interview (type "answer", by jobAppliedId + answerId from list_interview_answers) and ' +
				'the profile links (type "link", by url).',
			inputSchema: {},
		},
		guard(async () => {
			const result = await network.getPublicProfile(uid)
			if (!result.ok) return fail(result)
			const lang = await locale()
			return ok({
				...result.data,
				publicUrl: result.data.availability === 'hidden' ? null : network.publicUrlFor(result.data.handle),
				items: result.data.items.map((item) => ({
					...item,
					curation: item.moderation ? CURATION_EXPLANATION[lang][item.moderation.state] : CURATION_EXPLANATION[lang].pending,
				})),
				consent: { version: result.data.consentVersion, summary: PUBLIC_PROFILE_CONSENT_SUMMARY[lang] },
				howItWorks:
					lang === 'en'
						? 'A handle is required before publishing; the page only shows while availability is not "hidden"; every item goes through curation before it appears.'
						: 'É preciso escolher um @handle antes de publicar; a página só aparece enquanto a disponibilidade não for "hidden"; todo item passa pela curadoria antes de aparecer.',
			})
		}),
	)

	server.registerTool(
		'set_public_profile_handle',
		{
			title: 'Choose my public profile handle on Coploy',
			annotations: SAFE_WRITE,
			description:
				'Choose or change the @handle of the public page (3–30 chars: lowercase letters, digits, hyphen). Checks availability first ' +
				'and explains why a handle is not available (invalid | reserved | taken | locked — a handle someone else dropped stays locked for 90 days).',
			inputSchema: { handle: z.string().min(3).max(31) },
		},
		guard(async ({ handle }) => {
			const check = await network.checkHandle(uid, handle)
			if (!check.ok) return fail(check)
			if (!check.data.available) return ok({ available: false, reason: check.data.reason })
			const result = await network.setHandle(uid, handle)
			return result.ok ? ok({ available: true, handle: result.data.handle, publicUrl: network.publicUrlFor(result.data.handle) }) : fail(result)
		}),
	)

	server.registerTool(
		'set_public_profile_availability',
		{
			title: 'Set my public profile visibility on Coploy',
			annotations: SAFE_WRITE,
			description:
				'available = shown as open to jobs; open_to_talk = shown, but not actively looking; hidden = the page is not served to anyone. ' +
				'Requires a handle unless hidden.',
			inputSchema: { availability: z.enum(['available', 'open_to_talk', 'hidden']) },
		},
		guard(async ({ availability }) => {
			const result = await network.setAvailability(uid, availability)
			return result.ok ? ok({ availability: result.data.availability, publicUrl: availability === 'hidden' ? null : network.publicUrlFor(result.data.handle) }) : fail(result)
		}),
	)

	server.registerTool(
		'publish_public_profile_item',
		{
			title: 'Publish one item to my public profile on Coploy',
			annotations: SAFE_WRITE,
			description:
				'Publish ONE item to the public page after the person explicitly agreed (accepted: true) to the consent summary from ' +
				'get_my_public_profile — never on your own initiative, never several at once without a yes for each. The item goes ' +
				'through curation before it appears: the response carries its state and what it means. ' +
				'type "profile" needs nothing else; "project" needs projectId; "answer" needs jobAppliedId + answerId (withFeedback shows ' +
				'the AI reading of that answer next to the video); "link" needs url (one of the profile links).',
			inputSchema: {
				type: z.enum(['profile', 'project', 'answer', 'link']),
				projectId: z.string().optional(),
				jobAppliedId: z.string().optional(),
				answerId: z.string().optional(),
				url: z.string().url().optional(),
				withFeedback: z.boolean().optional(),
				accepted: z.boolean().describe('true ONLY after the person explicitly agreed to publish this item'),
			},
		},
		guard(async ({ accepted, ...input }) => {
			if (accepted !== true) return consentRequired()
			const result = await network.publishItem(uid, input)
			if (!result.ok) return fail(result, 'A handle is required before publishing (set_public_profile_handle).')
			const lang = await locale()
			const published = result.data.items[result.data.items.length - 1]
			const state = published?.moderation?.state ?? 'pending'
			return ok({
				item: published,
				curation: CURATION_EXPLANATION[lang][state],
				publicUrl: result.data.availability === 'hidden' ? null : network.publicUrlFor(result.data.handle),
			})
		}),
	)

	server.registerTool(
		'remove_public_profile_item',
		{
			title: 'Take one item off my public profile on Coploy',
			annotations: DESTRUCTIVE,
			description: 'Take ONE published item off the public page (the item itself — project, answer, link — is kept). Only when the person asks.',
			inputSchema: { itemId: z.string().min(1).describe('Item id from get_my_public_profile') },
		},
		guard(async ({ itemId }) => {
			const result = await network.removeItem(uid, itemId)
			return result.ok ? ok({ removed: true }) : fail(result)
		}),
	)

	server.registerTool(
		'revoke_public_profile',
		{
			title: 'Revoke my whole public profile on Coploy',
			annotations: DESTRUCTIVE,
			description:
				'Take the whole public page down: every item off, visibility hidden, de-indexing requested. Permanent for the items ' +
				'(they can be published again one by one later). Only after an explicit, unambiguous request.',
			inputSchema: {},
		},
		guard(async () => {
			const result = await network.revokePublicProfile(uid)
			return result.ok ? ok({ revoked: true }) : fail(result)
		}),
	)

	// ─── vitrine por link ─────────────────────────────────────────────────
	server.registerTool(
		'list_interview_answers',
		{
			title: 'List the answers of one of my interviews on Coploy',
			annotations: READ_ONLY,
			description:
				'The questions and answers of ONE finished interview (from get_my_interviews): question, the transcript, whether there is a video, ' +
				'the AI reading (feedback), strengths and points to develop. No score and no verdict, by design. ' +
				'Use it to help the person choose which answers to put on the public profile or the showcase.',
			inputSchema: { jobAppliedId: z.string().min(1) },
		},
		guard(async ({ jobAppliedId }) => {
			const result = await network.listAnswers(uid, jobAppliedId)
			if (!result.ok) return fail(result)
			return ok({
				answers: result.data.answers.map((answer) => ({
					id: answer.id,
					question: answer.question,
					hasVideo: Boolean(answer.videoUrl),
					answer: answer.answer,
					feedback: answer.feedback,
					strengths: answer.strengths,
					improvement: answer.improvement,
					skipped: answer.skipped === true,
				})),
			})
		}),
	)

	server.registerTool(
		'get_my_showcase',
		{
			title: 'Get my showcase link on Coploy',
			annotations: READ_ONLY,
			description:
				'The showcase is an opaque link with chosen video answers, for the person to send to whoever they want (no score, no verdict, ' +
				'no company name). Returns the current showcase (link, items, expiry, views) or null, plus the consent summary to read before publishing.',
			inputSchema: {},
		},
		guard(async () => {
			const result = await network.getShowcase(uid)
			if (!result.ok) return fail(result)
			const lang = await locale()
			return ok({ showcase: result.data.showcase, consent: { summary: SHOWCASE_CONSENT_SUMMARY[lang] } })
		}),
	)

	server.registerTool(
		'publish_showcase',
		{
			title: 'Publish or update my showcase link on Coploy',
			annotations: SAFE_WRITE,
			description:
				'Set the showcase to exactly these video answers (max 12; jobAppliedId + answerId from list_interview_answers), an optional headline ' +
				'and validity in days (default 2 years; null = never expires). Replacing the selection keeps the same link. ' +
				'Requires accepted: true after the person agreed to the consent summary from get_my_showcase.',
			inputSchema: {
				items: z.array(z.object({ jobAppliedId: z.string().min(1), answerId: z.string().min(1), withFeedback: z.boolean().optional() })).min(1).max(12),
				headline: z.string().max(120).nullable().optional(),
				expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
				accepted: z.boolean(),
			},
		},
		guard(async ({ accepted, ...body }) => {
			if (accepted !== true) return consentRequired()
			const result = await network.publishShowcase(uid, body)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	server.registerTool(
		'revoke_showcase',
		{
			title: 'Revoke my showcase link on Coploy',
			annotations: DESTRUCTIVE,
			description: 'Kill the showcase link permanently — whoever has it stops seeing it. Publishing again issues a NEW link. Only when the person asks.',
			inputSchema: {},
		},
		guard(async () => {
			const result = await network.revokeShowcase(uid)
			return result.ok ? ok(result.data) : fail(result)
		}),
	)

	// ─── prova verificada (OTS) e portabilidade ───────────────────────────
	server.registerTool(
		'list_my_attestations',
		{
			title: 'List my verified interview attestations (OTS) on Coploy',
			annotations: READ_ONLY,
			description:
				'Verified attestations the person issued about their finished interviews: tier, validity, status, and the signed document (jws) ' +
				'they can hand to another company. Also returns the consent summary to read before issuing one.',
			inputSchema: {},
		},
		async () => {
			const result = await network.listAttestations(uid)
			if (!result.ok) return fail(result)
			const lang = await locale()
			return ok({ attestations: result.data.attestations, consent: { summary: ATTESTATION_CONSENT_SUMMARY[lang] } })
		},
	)

	server.registerTool(
		'issue_attestation',
		{
			title: 'Issue a verified interview attestation (OTS) on Coploy',
			annotations: SAFE_WRITE,
			description:
				'Issue a signed attestation about ONE finished interview (jobAppliedId from get_my_interviews). The person chooses the tier ' +
				'(existence | summary | full) and validity in days (default 2 years). Requires accepted: true after they agreed to the consent ' +
				'summary from list_my_attestations. A 503 means this server does not issue attestations.',
			inputSchema: {
				jobAppliedId: z.string().min(1),
				tier: z.enum(['existence', 'summary', 'full']),
				expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
				accepted: z.boolean(),
			},
		},
		async ({ accepted, ...body }) => {
			if (accepted !== true) return consentRequired()
			const result = await network.issueAttestation(uid, body)
			return result.ok ? ok(result.data) : fail(result, result.status === 503 ? 'This server does not issue attestations.' : undefined)
		},
	)

	server.registerTool(
		'revoke_attestation',
		{
			title: 'Revoke one of my attestations (OTS) on Coploy',
			annotations: DESTRUCTIVE,
			description: 'Revoke ONE attestation by jti — permanent; anyone checking its statusUrl sees "revoked". Only when the person asks.',
			inputSchema: { jti: z.string().min(8) },
		},
		async ({ jti }) => {
			const result = await network.revokeAttestation(uid, jti)
			return result.ok ? ok(result.data) : fail(result)
		},
	)

	server.registerTool(
		'export_my_profile',
		{
			title: 'Export my profile in the open OTS format',
			annotations: READ_ONLY,
			description:
				'The living résumé in the Open Talent Standard 0.1 format, with provenance per field — the person\'s data, portable to any ' +
				'other OTS provider. Protected attributes never leave. Hand the JSON over as-is when they ask to take their data with them.',
			inputSchema: {},
		},
		async () => {
			const result = await network.exportProfile(uid)
			return result.ok ? ok(result.data) : fail(result)
		},
	)
}
