/**
 * Editor de lacunas do currículo — renderizado inline no ChatGPT.
 *
 * NÃO é um formulário de cadastro. Formulário longo é onde o candidato
 * desiste, então aqui só aparecem os campos que **faltam**, no máximo alguns
 * por vez e ordenados por impacto, sempre com a opção de pular. O trabalho
 * pesado é da conversa (`import_profile`); isto é o arremate para quem prefere
 * clicar a digitar.
 *
 * Salva chamando `import_profile` — por isso a tool precisa de
 * `openai/widgetAccessible: true`. Rótulos e tipos de campo vêm de
 * `profile-fields.ts`, o mesmo lugar que as tools de escrita leem.
 */
export const PROFILE_GAPS_WIDGET_URI = 'ui://coploy/profile-gaps.html'

import { PROFILE_FORM_FIELDS, PROFILE_FORM_STRINGS } from '../profile-fields'

export const PROFILE_GAPS_WIDGET_HTML = `<!DOCTYPE html>
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
	/* id+classe: o host injeta CSS próprio e uma regra dele em #root venceria uma classe */
	#root.app {
		box-sizing: border-box !important;
		width: 100% !important; max-width: 100% !important;
		padding: 18px 20px 16px !important; margin: 0 !important; overflow: hidden !important;
	}
	.bar { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; margin-bottom: 6px; }
	.bar span { display: block; height: 100%; background: var(--accent-bg); transition: width .3s; }
	.pct { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
	.pct b { color: var(--accent); }
	.field { margin-bottom: 12px; }
	label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; }
	.hint { font-size: 11px; color: var(--muted); font-weight: 400; }
	input, textarea {
		width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--border);
		background: var(--bg); color: var(--text); font-size: 13px; font-family: inherit;
	}
	textarea { resize: vertical; min-height: 62px; }
	.actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; }
	.save {
		border: none; border-radius: 10px; padding: 10px 18px; cursor: pointer;
		background: var(--accent-bg); color: var(--accent-text); font-weight: 700; font-size: 13px;
	}
	.save[disabled] { opacity: .55; cursor: default; }
	.skip { background: none; border: none; color: var(--muted); font-size: 12px; cursor: pointer; text-decoration: underline; }
	.done { padding: 10px 2px; font-size: 13px; color: var(--accent); font-weight: 600; }
	.more { background: none; border: none; color: var(--accent); font-size: 12px; cursor: pointer; font-weight: 600; padding: 4px 0; }
	select {
		width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--border);
		background: var(--bg); color: var(--text); font-size: 13px; font-family: inherit;
	}
	.multi { display: flex; flex-wrap: wrap; gap: 8px; }
	.multi label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; margin: 0; cursor: pointer; }
	.multi input { width: auto; }
	.link { font-size: 12px; color: var(--muted); }
	.link a { color: var(--accent); font-weight: 600; }
</style>
</head>
<body>
<div class="app" id="root"></div>
<script>
(function () {
	var root = document.getElementById('root')

	/* Gerado de profile-fields.ts — a fonte única dos campos e rótulos. */
	var FIELDS = ${JSON.stringify(PROFILE_FORM_FIELDS)}
	var FIELD_STRINGS = ${JSON.stringify(PROFILE_FORM_STRINGS)}

	var STRINGS = {
		'pt-BR': {
			title: function (n) { return n === 1 ? 'Falta 1 informação pra completar seu perfil' : 'Faltam ' + n + ' informações pra completar seu perfil' },
			complete: 'completo',
			save: 'Salvar',
			saving: 'Salvando...',
			skip: 'Depois',
			showMore: 'Mostrar mais campos',
			saved: 'Perfil atualizado ✓',
			empty: 'Seu perfil está completo ✓',
			openLink: 'Anexar na área do candidato',
			fields: FIELD_STRINGS['pt-BR']
		},
		en: {
			title: function (n) { return n === 1 ? '1 detail left to complete your profile' : n + ' details left to complete your profile' },
			complete: 'complete',
			save: 'Save',
			saving: 'Saving...',
			skip: 'Later',
			showMore: 'Show more fields',
			saved: 'Profile updated ✓',
			empty: 'Your profile is complete ✓',
			openLink: 'Attach in your candidate area',
			fields: FIELD_STRINGS.en
		}
	}
	var tr = STRINGS['pt-BR']

	/** Só alguns por vez: lista longa é o que faz a pessoa fechar. */
	var INITIAL_FIELDS = 3
	var expanded = false
	var saved = false

	function api() { return window.openai || {} }
	function el(tag, cls, text) {
		var n = document.createElement(tag)
		if (cls) n.className = cls
		if (text != null) n.textContent = text
		return n
	}

	var LEVELS = { basico: 'basic', básico: 'basic', intermediario: 'intermediate', intermediário: 'intermediate', avancado: 'advanced', avançado: 'advanced', fluente: 'fluent', nativo: 'native', basic: 'basic', intermediate: 'intermediate', advanced: 'advanced', fluent: 'fluent', native: 'native' }

	/** Texto livre → estrutura que o currículo espera. */
	function parseValue(field, raw) {
		var value = raw.trim()
		if (!value) return null
		if (field === 'skills') {
			return value.split(',').map(function (s) { return s.trim() }).filter(Boolean)
		}
		if (field === 'skillDetails') {
			// "React: avançado" / "React - 5 anos", uma por linha ou por vírgula
			return value.split(/[\\n,]+/).map(function (item) {
				var parts = item.split(/\\s*[:\\-—]\\s*/)
				var name = (parts[0] || '').trim()
				return name ? { name: name, level: (parts[1] || '').trim() || undefined } : null
			}).filter(Boolean)
		}
		if (field === 'experiences') {
			// "Tech Lead na Coploy" / "Tech Lead at Coploy" / "Tech Lead - Coploy"
			var m = value.split(/\\s+(?:na|no|at|@|-|—)\\s+/i)
			return [{ title: m[0], company: m[1] || undefined, current: true }]
		}
		if (field === 'education') {
			var e = value.split(/\\s+(?:na|no|at|@|-|—)\\s+/i)
			return [{ degree: e[0], institution: e[1] || undefined }]
		}
		if (field === 'languages') {
			return value.split(',').map(function (item) {
				var parts = item.trim().split(/\\s+/)
				var last = (parts[parts.length - 1] || '').toLowerCase()
				var proficiency = LEVELS[last]
				return {
					language: proficiency ? parts.slice(0, -1).join(' ') : item.trim(),
					proficiency: proficiency
				}
			}).filter(function (l) { return l.language })
		}
		return value
	}

	/** Lê o controle de cada campo conforme o tipo (texto, seleção, múltipla). */
	function readInput(field, input) {
		var spec = FIELDS[field] || { kind: 'text' }
		if (spec.kind === 'multi') {
			var picked = []
			for (var i = 0; i < input.length; i++) if (input[i].checked) picked.push(input[i].value)
			return picked.length ? picked : null
		}
		if (spec.kind === 'select') return input.value || null
		if (spec.kind === 'link') return null
		return parseValue(field, input.value)
	}

	function save(fields, button) {
		var host = api()
		var payload = {}
		for (var field in fields) {
			var parsed = readInput(field, fields[field])
			if (parsed != null && (!Array.isArray(parsed) || parsed.length > 0)) payload[field] = parsed
		}
		if (Object.keys(payload).length === 0) return

		button.disabled = true
		button.textContent = tr.saving
		// import_profile: mesmo merge defensivo do resto do fluxo — não sobrescreve
		// o que já existe e deduplica as listas.
		var call = typeof host.callTool === 'function'
			? host.callTool('import_profile', payload)
			: Promise.reject(new Error('no host'))
		call
			.then(function () {
				saved = true
				render()
				if (typeof host.sendFollowUpMessage === 'function') {
					host.sendFollowUpMessage({ prompt: 'Atualizei meu perfil. O que falta agora?' })
				}
			})
			.catch(function () {
				button.disabled = false
				button.textContent = tr.save
			})
	}

	function buildControl(field, meta, wrap, data) {
		var spec = FIELDS[field] || { kind: 'text' }
		if (spec.kind === 'link') {
			var note = el('div', 'link')
			// sem área do candidato (instalação open) não há para onde apontar
			if (!data.resumeUploadUrl) { wrap.appendChild(note); return note }
			var a = el('a', null, tr.openLink)
			a.href = data.resumeUploadUrl || '#'
			a.addEventListener('click', function (ev) {
				ev.preventDefault()
				var host = api()
				if (typeof host.openExternal === 'function') host.openExternal({ href: a.href })
				else window.open(a.href, '_blank')
			})
			note.appendChild(a)
			wrap.appendChild(note)
			return note
		}
		if (spec.kind === 'select') {
			var select = document.createElement('select')
			select.appendChild(new Option(meta.hint, ''))
			;(spec.values || []).forEach(function (v) { select.appendChild(new Option((meta.options || {})[v] || v, v)) })
			wrap.appendChild(select)
			return select
		}
		if (spec.kind === 'multi') {
			var box = el('div', 'multi')
			var boxes = []
			;(spec.values || []).forEach(function (v) {
				var label = el('label')
				var cb = document.createElement('input')
				cb.type = 'checkbox'
				cb.value = v
				label.appendChild(cb)
				label.appendChild(document.createTextNode((meta.options || {})[v] || v))
				box.appendChild(label)
				boxes.push(cb)
			})
			wrap.appendChild(box)
			return boxes
		}
		var input = document.createElement(spec.kind === 'textarea' ? 'textarea' : 'input')
		input.placeholder = meta.hint
		wrap.appendChild(input)
		return input
	}

	function render() {
		var out = api().toolOutput
		var data = (out && (out.structuredContent || out)) || {}
		tr = String(data.language || 'pt-BR').toLowerCase().indexOf('en') === 0 ? STRINGS.en : STRINGS['pt-BR']

		root.textContent = ''

		if (saved) {
			root.appendChild(el('div', 'done', tr.saved))
			return
		}

		var missing = (data.missingFields || []).filter(function (f) { return tr.fields[f] })
		var completeness = data.completeness || 0

		if (missing.length === 0) {
			root.appendChild(el('div', 'done', tr.empty))
			return
		}

		var bar = el('div', 'bar')
		var fill = el('span')
		fill.style.width = completeness + '%'
		bar.appendChild(fill)
		root.appendChild(bar)

		var pct = el('div', 'pct')
		pct.appendChild(el('b', null, completeness + '% ' + tr.complete))
		pct.appendChild(document.createTextNode(' · ' + tr.title(missing.length)))
		root.appendChild(pct)

		var visible = expanded ? missing : missing.slice(0, INITIAL_FIELDS)
		var inputs = {}

		visible.forEach(function (field) {
			var meta = tr.fields[field]
			var wrap = el('div', 'field')
			var label = el('label', null, meta.label + ' ')
			label.appendChild(el('span', 'hint', '· ' + meta.hint))
			wrap.appendChild(label)
			inputs[field] = buildControl(field, meta, wrap, data)
			root.appendChild(wrap)
		})

		if (!expanded && missing.length > INITIAL_FIELDS) {
			var more = el('button', 'more', tr.showMore + ' (' + (missing.length - INITIAL_FIELDS) + ')')
			more.addEventListener('click', function () { expanded = true; render() })
			root.appendChild(more)
		}

		var actions = el('div', 'actions')
		var saveBtn = el('button', 'save', tr.save)
		saveBtn.addEventListener('click', function () { save(inputs, saveBtn) })
		actions.appendChild(saveBtn)

		// Pular é first-class: ninguém deve se sentir preso ao formulário
		var skip = el('button', 'skip', tr.skip)
		skip.addEventListener('click', function () {
			saved = true
			render()
		})
		actions.appendChild(skip)
		root.appendChild(actions)
	}

	render()
	window.addEventListener('openai:set_globals', render)
})()
</script>
</body>
</html>`
