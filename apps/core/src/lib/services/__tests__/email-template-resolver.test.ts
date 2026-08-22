import { createEmailTemplateResolver, withCustomSubject } from '../email-template-resolver'

function makeInfra(templates: unknown[] | Error) {
	return {
		orgRepository: {
			listEmailTemplates: jest.fn().mockImplementation(async () => {
				if (templates instanceof Error) throw templates
				return templates
			}),
		},
	} as never
}

/**
 * O resolver é o elo que faltava: os templates eram gravados e nenhum caminho
 * de envio os lia. Estes testes travam as três formas de ele voltar a ser
 * enfeite — não achar, achar e ignorar, ou derrubar o e-mail ao falhar.
 */
describe('template de e-mail da empresa', () => {
	it('troca as variáveis conhecidas', async () => {
		const resolver = createEmailTemplateResolver(
			makeInfra([
				{
					kind: 'interview_invite',
					subject: 'Entrevista para {{vaga}}',
					body: 'Olá {{candidato}}, a {{empresa}} convidou você. Acesse {{link}}.',
					active: true,
				},
			]),
		)

		const result = await resolver.resolve('c1', 'interview_invite', {
			candidato: 'Ana',
			vaga: 'Dev',
			empresa: 'Coploy',
			link: 'https://x.test',
		})

		expect(result.subject).toBe('Entrevista para Dev')
		expect(result.body).toBe('Olá Ana, a Coploy convidou você. Acesse https://x.test.')
	})

	it('empresa sem template configurado usa a cópia padrão', async () => {
		const resolver = createEmailTemplateResolver(makeInfra([]))
		await expect(resolver.resolve('c1', 'rejection_feedback', {})).resolves.toEqual({
			subject: null,
			body: null,
		})
	})

	it('template desativado não é aplicado', async () => {
		const resolver = createEmailTemplateResolver(
			makeInfra([{ kind: 'interview_invite', subject: 'x', body: 'y', active: false }]),
		)
		await expect(resolver.resolve('c1', 'interview_invite', {})).resolves.toEqual({
			subject: null,
			body: null,
		})
	})

	it('não confunde um tipo com outro', async () => {
		const resolver = createEmailTemplateResolver(
			makeInfra([{ kind: 'profile_request', subject: 'Perfil', body: 'b', active: true }]),
		)
		await expect(resolver.resolve('c1', 'interview_invite', {})).resolves.toEqual({
			subject: null,
			body: null,
		})
	})

	/*
	 * O e-mail precisa sair. Se o repositório cair, o candidato recebe a cópia
	 * padrão — deixar a indisponibilidade do Firestore bloquear a resposta
	 * inverteria a prioridade, e o anti-ghosting é justamente a promessa de que
	 * a resposta sai.
	 */
	it('falha de leitura não derruba o envio', async () => {
		const resolver = createEmailTemplateResolver(makeInfra(new Error('firestore offline')))
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

		await expect(resolver.resolve('c1', 'application_ack', {})).resolves.toEqual({
			subject: null,
			body: null,
		})
		expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({
			tag: 'emailTemplate.resolveFailed',
		})
		warn.mockRestore()
	})

	it('campo em branco no template não sobrescreve o padrão', async () => {
		const resolver = createEmailTemplateResolver(
			makeInfra([{ kind: 'interview_invite', subject: '   ', body: 'corpo', active: true }]),
		)
		const result = await resolver.resolve('c1', 'interview_invite', {})
		expect(result.subject).toBeNull()
		expect(result.body).toBe('corpo')
	})
})

describe('withCustomSubject', () => {
	it('substitui o assunto quando há template', () => {
		expect(withCustomSubject({ subject: 'padrão', htmlBody: '<p/>' }, 'meu')).toEqual({
			subject: 'meu',
			htmlBody: '<p/>',
		})
	})

	it('mantém o e-mail intacto quando não há', () => {
		const rendered = { subject: 'padrão', htmlBody: '<p/>' }
		expect(withCustomSubject(rendered, null)).toBe(rendered)
	})
})
