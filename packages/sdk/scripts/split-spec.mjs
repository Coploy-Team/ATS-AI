/**
 * Divide o contrato público (apps/core/openapi.public.json) em um spec por
 * superfície (`x-surface`), insumo do Orval. Intermediários em .orval/
 * (gitignorados) — a fonte de verdade é o artefato do core.
 *
 * Também trava o lockstep de versão (ADR-004): major.minor do pacote deve
 * ser igual ao do contrato.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const contractPath = resolve(pkgRoot, '../../apps/core/openapi.public.json')

const SURFACES = ['empresa', 'candidato', 'publico', 'integracoes']
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8'))

const [cMajor, cMinor] = contract.info.version.split('.')
const [pMajor, pMinor] = pkg.version.split('.')
if (cMajor !== pMajor || cMinor !== pMinor) {
  console.error(
    `Lockstep violado (ADR-004): contrato v${contract.info.version} × pacote v${pkg.version}. ` +
      'major.minor devem ser iguais — bump o package.json do SDK junto com o contrato.',
  )
  process.exit(1)
}

const outDir = resolve(pkgRoot, '.orval')
mkdirSync(outDir, { recursive: true })

for (const surface of SURFACES) {
  const paths = {}
  let ops = 0
  for (const [path, item] of Object.entries(contract.paths)) {
    const kept = {}
    for (const method of METHODS) {
      const op = item[method]
      if (op && op['x-surface'] === surface) {
        kept[method] = op
        ops++
      }
    }
    if (Object.keys(kept).length > 0) paths[path] = kept
  }
  const spec = { ...contract, paths }
  writeFileSync(resolve(outDir, `${surface}.json`), JSON.stringify(spec))
  console.log(`${surface}: ${ops} operações → .orval/${surface}.json`)
}
