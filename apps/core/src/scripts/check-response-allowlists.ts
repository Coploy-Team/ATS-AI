/**
 * Campo que o cliente lê e a API nunca manda.
 *
 * ## O defeito que este check existe para pegar
 *
 * Algumas rotas montam a resposta como LISTA EXPLÍCITA de campos — decisão
 * correta, para não vazar `DocumentReference` num spread. O efeito colateral é
 * que campo novo só chega ao cliente se alguém lembrar de adicioná-lo ali, e
 * esquecer não produz erro nenhum: o dado é gravado, validado, persistido — e
 * some na saída.
 *
 * Custou quatro investigações: `interviewUrl` (a vaga não tinha como ser
 * divulgada), `orgUnitId` e `customFieldValues` (abriam em branco na edição),
 * `yearsOfExperience` (a busca não filtrava) e `evaluateLanguage` (editar a
 * vaga DESLIGAVA a avaliação de idioma). Sempre o mesmo formato, sempre
 * descoberto por acaso.
 *
 * ## Como ele decide
 *
 * Cruza o que o formulário de edição do ATS LÊ de uma vaga com o que a rota
 * devolve. É um recorte estreito de propósito: o formulário é onde o campo
 * ausente vira destrutivo, porque o PUT manda o rascunho inteiro e o que não
 * foi hidratado é gravado vazio.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(process.cwd(), '..', '..')
const FORM = resolve(ROOT, 'web/ats/src/features/job-form/job-form-page.tsx')
const ROUTE = resolve(process.cwd(), 'src/http/routes/companies/jobs/get-job.ts')

function hydratedFields(): Set<string> {
	const source = readFileSync(FORM, 'utf8')
	const start = source.indexOf('\t\tsetDraft({\n\t\t\t...EMPTY,')
	const end = source.indexOf('\t\tsetHydrated(true)')
	if (start < 0 || end < 0) {
		// o formulário mudou de forma: falhar alto é melhor que passar em falso
		throw new Error('Bloco de hidratação não encontrado em job-form-page.tsx')
	}
	const block = source.slice(start, end)
	const fields = new Set<string>()
	for (const match of block.matchAll(/str\('([A-Za-z_]\w*)'\)/g)) fields.add(match[1])
	for (const match of block.matchAll(/job\.([A-Za-z_]\w*)/g)) fields.add(match[1])
	return fields
}

function returnedFields(): Set<string> {
	const source = readFileSync(ROUTE, 'utf8')
	const start = source.indexOf('        return {\n          // Dados principais controlados')
	if (start < 0) throw new Error('Bloco de resposta não encontrado em get-job.ts')
	const block = source.slice(start, source.indexOf('\n        }\n', start))
	const fields = new Set<string>()
	for (const match of block.matchAll(/^\s{10}([A-Za-z_]\w*):/gm)) fields.add(match[1])
	return fields
}

function main() {
	const returned = returnedFields()
	const missing = [...hydratedFields()].filter((field) => !returned.has(field)).sort()

	if (missing.length === 0) {
		console.info('✓ Resposta da vaga cobre todo campo que a edição hidrata')
		return
	}

	console.error('\n✗ A tela de edição lê campos que o GET da vaga NÃO devolve:\n')
	for (const field of missing) console.error(`  ${field}`)
	console.error(
		'\nAdicione-os ao retorno de get-job.ts (a resposta é uma allowlist).' +
			'\nSem isso o campo abre vazio na edição — e o PUT, que manda o rascunho' +
			'\ninteiro, GRAVA vazio. O usuário perde a configuração sem digitar nada.',
	)
	process.exit(1)
}

main()
