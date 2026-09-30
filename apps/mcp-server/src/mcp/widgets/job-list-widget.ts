/**
 * Widget de cards de vagas (Apps SDK / MCP Apps) — renderizado inline no
 * ChatGPT como resultado do search_jobs. Self-contained: vanilla JS + CSS
 * inline, lê window.openai.toolOutput ({ total, totalAvailable, jobs }).
 *
 * Modelo de negócio da Coploy: não existe "candidatura" — o candidato abre o
 * link da vaga e faz a entrevista com IA. Por isso o CTA é "Fazer entrevista",
 * e ele ABRE NA HORA: é uma âncora, sem tool call no caminho. Quando a busca
 * veio autenticada, o payload traz um ticket de handoff que o link carrega,
 * pra pessoa entrar já logada.
 *
 * "Mostrar mais vagas" re-chama search_jobs com limit maior — não existe site
 * público listando todas as vagas.
 */
export const JOB_LIST_WIDGET_URI = 'ui://coploy/job-list.html'

export const JOB_LIST_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
	* { box-sizing: border-box; margin: 0; padding: 0; }
	:root {
		--bg: #ffffff; --card: #fafafa; --border: #e4e4e4; --text: #111311;
		--muted: #6b716c; --accent: #5a7a12; --accent-bg: #d3f26a; --accent-text: #1a2005;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--bg: transparent; --card: #1c1f1d; --border: #2e332f; --text: #f2f4f1;
			--muted: #9aa09b; --accent: #d3f26a; --accent-bg: #d3f26a; --accent-text: #1a2005;
		}
	}
	html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); }
	/* Seletor id+classe (+ !important) porque o host injeta CSS próprio no
	   iframe: uma regra dele em #root (especificidade de id) venceria uma
	   classe sozinha e zerava o padding — era isso que jogava o header
	   contra a borda do frame. */
	#root.app {
		box-sizing: border-box !important;
		width: 100% !important;
		max-width: 100% !important;
		padding: 18px 20px 14px !important;
		margin: 0 !important;
		overflow: hidden !important;
	}
	/* Sem header de marca: o host já exibe "Coploy" acima do widget. A
	   contagem vive no rodapé, junto do botão de carregar mais. */
	.count { font-size: 12px; color: var(--muted); text-align: center; padding-bottom: 8px; }
	.card {
		display: flex; align-items: center; gap: 12px; padding: 12px;
		background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px;
	}
	.logo {
		width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; object-fit: cover;
		background: var(--accent-bg); color: var(--accent-text);
		display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
	}
	.info { flex: 1; min-width: 0; }
	.title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
	.salary { color: var(--accent); font-weight: 600; }
	.tags { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
	.tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
	.cta {
		flex-shrink: 0; border: none; border-radius: 10px; padding: 9px 16px; cursor: pointer;
		background: var(--accent-bg); color: var(--accent-text); font-weight: 700; font-size: 13px;
		white-space: nowrap; text-decoration: none; display: inline-block;
	}
	.empty { padding: 6px 2px; text-align: left; color: var(--muted); font-size: 12px; opacity: .8; }
	.footer { text-align: center; padding: 8px 6px 2px; }
	.footer button { background: none; border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; color: var(--accent); font-size: 12px; cursor: pointer; font-weight: 600; }
	.footer button[disabled] { opacity: .55; cursor: default; }
</style>
</head>
<body>
<div class="app" id="root"></div>
<script>
(function () {
	var root = document.getElementById('root')

	// Idioma vem do payload da tool (regra do canal: explícito > perfil > pt-BR)
	var STRINGS = {
		'pt-BR': {
			counter: function (shown, total) {
				return total > shown ? 'Mostrando ' + shown + ' de ' + total + ' vagas' : total + (total === 1 ? ' vaga' : ' vagas')
			},
			cta: 'Fazer entrevista',
			loading: 'Carregando vagas...',
			empty: 'Nenhuma vaga encontrada — tente outros termos.',
			showMore: 'Mostrar mais vagas',
			loadingMore: 'Carregando...',
		},
		en: {
			counter: function (shown, total) {
				return total > shown ? 'Showing ' + shown + ' of ' + total + ' jobs' : total + (total === 1 ? ' job' : ' jobs')
			},
			cta: 'Start interview',
			loading: 'Loading jobs...',
			empty: 'No jobs found — try different terms.',
			showMore: 'Show more jobs',
			loadingMore: 'Loading...',
		}
	}
	var tr = STRINGS['pt-BR']
	// Payload corrente: começa no toolOutput e é substituído quando o usuário
	// pede mais vagas (nova chamada do search_jobs a partir do widget).
	var state = null

	function el(tag, cls, text) {
		var node = document.createElement(tag)
		if (cls) node.className = cls
		if (text != null) node.textContent = text
		return node
	}

	function initialFor(name) {
		return (name || '?').trim().charAt(0).toUpperCase() || '?'
	}

	function metaLine(job) {
		return [job.companyName, job.location, job.workModality].filter(Boolean).join(' · ')
	}

	function api() { return window.openai || {} }

	/**
	 * O clique abre a entrevista IMEDIATAMENTE.
	 *
	 * Antes o botão chamava start_interview e só depois abria — o usuário
	 * clicava e "não acontecia nada" por segundos. A sessão da entrevista já é
	 * criada pelo próprio app ao acessar o link (create-if-not-exists), e o
	 * ticket de handoff vem pronto no payload da busca, então não há nada a
	 * esperar aqui.
	 */
	function interviewHref(job) {
		var url = job.interviewUrl
		if (!url) return '#'
		var code = (state || api().toolOutput || {}).handoff
		if (!code) {
			var out = api().toolOutput
			code = out && out.structuredContent && out.structuredContent.handoff
		}
		if (!code) return url
		return url + (url.indexOf('?') === -1 ? '?' : '&') + 'handoff=' + encodeURIComponent(code)
	}

	/** Não existe site público com todas as vagas — paginação é nova chamada da tool. */
	function loadMore(button, currentCount, query, language) {
		var host = api()
		if (typeof host.callTool !== 'function') return
		button.disabled = true
		button.textContent = tr.loadingMore
		var args = { limit: Math.min(currentCount + 10, 25) }
		if (query) args.query = query
		if (language) args.language = language
		host.callTool('search_jobs', args)
			.then(function (res) {
				var data = res && (res.structuredContent || res)
				if (data && Array.isArray(data.jobs)) {
					state = data
					render()
					return
				}
				button.disabled = false
				button.textContent = tr.showMore
			})
			.catch(function () {
				button.disabled = false
				button.textContent = tr.showMore
			})
	}

	function render() {
		// toolOutput chega DEPOIS do load do iframe — render idempotente,
		// disparado de novo pelo evento openai:set_globals do host.
		var rawOutput = state || api().toolOutput
		var output = (rawOutput && (rawOutput.structuredContent || rawOutput)) || {}
		var jobs = Array.isArray(output.jobs) ? output.jobs : []
		tr = String(output.language || 'pt-BR').toLowerCase().indexOf('en') === 0 ? STRINGS.en : STRINGS['pt-BR']

		root.textContent = ''

		if (!jobs.length) {
			// Busca sem resultado não deve ocupar a tela: o modelo já explica no
			// texto. Card grande aqui poluía a conversa quando ele buscava várias
			// vezes seguidas.
			root.appendChild(el('div', 'empty', rawOutput ? tr.empty : tr.loading))
			return
		}

		jobs.forEach(function (job) {
			var card = el('div', 'card')

			if (job.companyLogo) {
				var img = document.createElement('img')
				img.className = 'logo'
				img.src = job.companyLogo
				img.alt = job.companyName || ''
				img.onerror = function () {
					img.replaceWith(el('div', 'logo', initialFor(job.companyName || job.jobName)))
				}
				card.appendChild(img)
			} else {
				card.appendChild(el('div', 'logo', initialFor(job.companyName || job.jobName)))
			}

			var info = el('div', 'info')
			info.appendChild(el('div', 'title', job.jobName || '—'))
			var meta = el('div', 'meta')
			var metaText = metaLine(job)
			if (metaText) meta.textContent = metaText + (job.salary ? ' · ' : '')
			if (job.salary) meta.appendChild(el('span', 'salary', job.salary))
			if (meta.textContent || job.salary) info.appendChild(meta)

			var tagValues = [job.careerLevel, job.employmentType].filter(Boolean)
			if (job.mainSkills) {
				tagValues = tagValues.concat(String(job.mainSkills).split(',').slice(0, 3).map(function (s) { return s.trim() }))
			}
			if (tagValues.length) {
				var tags = el('div', 'tags')
				tagValues.filter(Boolean).slice(0, 4).forEach(function (value) { tags.appendChild(el('span', 'tag', value)) })
				info.appendChild(tags)
			}
			card.appendChild(info)

			// Âncora real: no mobile é o que dá mais chance de abrir no navegador
			// do sistema (a entrevista precisa de câmera/microfone, que o browser
			// embutido do app pode não liberar).
			var cta = document.createElement('a')
			cta.className = 'cta'
			cta.textContent = tr.cta
			cta.href = interviewHref(job)
			cta.target = '_blank'
			cta.rel = 'noopener noreferrer'
			cta.addEventListener('click', function (event) {
				var host = api()
				if (typeof host.openExternal === 'function') {
					event.preventDefault()
					host.openExternal({ href: cta.href })
				}
			})
			card.appendChild(cta)

			root.appendChild(card)
		})

		var total = output.totalAvailable || jobs.length
		var hasMore = total > jobs.length && typeof api().callTool === 'function'

		var footer = el('div', 'footer')
		footer.appendChild(el('div', 'count', tr.counter(jobs.length, total)))
		if (hasMore) {
			var more = el('button', null, tr.showMore)
			more.addEventListener('click', function () {
				loadMore(more, jobs.length, output.query, output.language)
			})
			footer.appendChild(more)
		}
		root.appendChild(footer)
	}

	render()
	// Host injeta/atualiza window.openai.* e avisa por este evento
	window.addEventListener('openai:set_globals', render)
})()
</script>
</body>
</html>`
