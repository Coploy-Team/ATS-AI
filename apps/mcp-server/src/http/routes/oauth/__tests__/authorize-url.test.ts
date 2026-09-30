jest.mock('@/env', () => ({
	env: { PUBLIC_BASE_URL: 'https://api-hml.coploy.io/mcp-server' },
}))

import { renderAuthorizePage } from '../authorize-page'

describe('página de autorização', () => {
	const page = (submitPath: string) =>
		renderAuthorizePage({
			clientName: 'ChatGPT',
			clientId: 'c',
			redirectUri: 'https://chatgpt.com/cb',
			codeChallenge: 'x',
			state: 's',
			scope: 'candidate',
			submitPath,
		})

	it('usa URL absoluta no form — action relativo quebrava o retry', () => {
		const html = page('https://api-hml.coploy.io/mcp-server/oauth/authorize/submit')

		// o bug: com action relativo, o re-render em cima do POST fazia a próxima
		// tentativa ir pra /oauth/authorize/authorize/submit
		expect(html).not.toMatch(/action="authorize\/submit"/)
		expect(html).toMatch(
			/action="https:\/\/api-hml\.coploy\.io\/mcp-server\/oauth\/authorize\/submit"/,
		)
	})

	it('mantém o prefixo do LB — sem ele a rota cai no backend padrão', () => {
		const html = page('https://api-hml.coploy.io/mcp-server/oauth/authorize/submit')
		const actions = [...html.matchAll(/action="([^"]+)"/g)].map((m) => m[1])

		expect(actions.length).toBeGreaterThan(0)
		for (const action of actions) expect(action).toContain('/mcp-server/oauth/authorize/submit')
	})
})
