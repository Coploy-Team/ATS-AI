/**
 * Página HTML de login/consentimento do fluxo OAuth. Self-contained (CSS
 * inline, zero assets externos) — renderizada pelo próprio mcp-server.
 */

export interface AuthorizePageParams {
	clientName: string
	clientId: string
	redirectUri: string
	codeChallenge: string
	state: string
	scope: string
	errorMessage?: string
	/**
	 * Caminho absoluto do POST do formulário.
	 *
	 * Tem que ser absoluto: com `action` relativo, o re-render da página em
	 * caso de erro (que responde ao POST em `/oauth/authorize/submit`) muda a
	 * base do browser, e a próxima tentativa vai para
	 * `/oauth/authorize/authorize/submit` → 404. Ou seja, quem errava a senha
	 * uma vez ficava travado. Também é o que faz funcionar atrás do LB, com ou
	 * sem prefixo de path.
	 */
	submitPath: string
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

export function renderAuthorizePage(params: AuthorizePageParams): string {
	const hidden = `
		<input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
		<input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
		<input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
		<input type="hidden" name="state" value="${escapeHtml(params.state)}" />
		<input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />`

	const errorBanner = params.errorMessage
		? `<div class="error">${escapeHtml(params.errorMessage)}</div>`
		: ''

	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Coploy — Autorizar acesso</title>
<style>
	:root { color-scheme: dark; }
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #0d0f0e; color: #f4f4f2; min-height: 100vh;
		display: flex; align-items: center; justify-content: center; padding: 24px;
	}
	.card { width: 100%; max-width: 400px; background: #161917; border: 1px solid #2a2e2b; border-radius: 16px; padding: 32px; }
	.logo { display: inline-block; background: #d3f26a; color: #0d0f0e; font-weight: 700; padding: 6px 14px; border-radius: 10px; margin-bottom: 20px; }
	h1 { font-size: 18px; margin-bottom: 6px; }
	.sub { color: #9aa09b; font-size: 14px; margin-bottom: 20px; }
	.sub strong { color: #d3f26a; }
	.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
	.tab { flex: 1; text-align: center; padding: 8px; border-radius: 8px; border: 1px solid #2a2e2b; color: #9aa09b; cursor: pointer; font-size: 14px; background: none; }
	.tab.active { background: #22261f; color: #d3f26a; border-color: #d3f26a; }
	form { display: none; flex-direction: column; gap: 12px; }
	form.active { display: flex; }
	label { font-size: 13px; color: #9aa09b; }
	input[type=text], input[type=email], input[type=password] {
		width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a2e2b;
		background: #0d0f0e; color: #f4f4f2; font-size: 14px;
	}
	button[type=submit] {
		margin-top: 8px; padding: 12px; border: none; border-radius: 10px;
		background: #d3f26a; color: #0d0f0e; font-weight: 700; font-size: 15px; cursor: pointer;
	}
	.consent { margin-top: 20px; padding: 12px; background: #0d0f0e; border: 1px solid #2a2e2b; border-radius: 10px; font-size: 12px; color: #9aa09b; }
	.error { background: #2a1518; border: 1px solid #5c2830; color: #ff9aa5; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
</style>
</head>
<body>
<main class="card">
	<span class="logo">Coploy</span>
	<h1>Autorizar acesso</h1>
	<p class="sub"><strong>${escapeHtml(params.clientName)}</strong> quer se conectar à sua conta Coploy para buscar vagas e enviar candidaturas em seu nome.</p>
	${errorBanner}
	<div class="tabs">
		<button type="button" class="tab active" id="tab-login" onclick="switchTab('login')">Entrar</button>
		<button type="button" class="tab" id="tab-signup" onclick="switchTab('signup')">Criar conta</button>
	</div>
	<form method="POST" action="${escapeHtml(params.submitPath)}" id="form-login" class="active">
		<input type="hidden" name="action" value="login" />${hidden}
		<label for="login-email">E-mail</label>
		<input id="login-email" type="email" name="email" required autocomplete="email" />
		<label for="login-password">Senha</label>
		<input id="login-password" type="password" name="password" required minlength="6" autocomplete="current-password" />
		<button type="submit">Entrar e autorizar</button>
	</form>
	<form method="POST" action="${escapeHtml(params.submitPath)}" id="form-signup">
		<input type="hidden" name="action" value="signup" />${hidden}
		<label for="signup-name">Nome completo</label>
		<input id="signup-name" type="text" name="name" required minlength="2" autocomplete="name" />
		<label for="signup-email">E-mail</label>
		<input id="signup-email" type="email" name="email" required autocomplete="email" />
		<label for="signup-password">Senha (mín. 6 caracteres, com maiúscula, minúscula e número)</label>
		<input id="signup-password" type="password" name="password" required minlength="6" autocomplete="new-password" />
		<button type="submit">Criar conta e autorizar</button>
	</form>
	<div class="consent">
		Ao autorizar, o assistente poderá: buscar vagas públicas, ver suas candidaturas e
		candidatar você a vagas — sempre a seu pedido. Você pode revogar o acesso removendo
		o conector no seu assistente.
	</div>
</main>
<script>
	function switchTab(which) {
		document.getElementById('form-login').classList.toggle('active', which === 'login')
		document.getElementById('form-signup').classList.toggle('active', which === 'signup')
		document.getElementById('tab-login').classList.toggle('active', which === 'login')
		document.getElementById('tab-signup').classList.toggle('active', which === 'signup')
	}
</script>
</body>
</html>`
}
