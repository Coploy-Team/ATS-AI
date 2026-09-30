import {
	filterPublicSpec,
	PublicContractViolation,
	PUBLIC_CONTRACT_VERSION,
} from '../public-contract'

function baseSpec(paths: Record<string, unknown>) {
	return {
		openapi: '3.0.3',
		info: { title: 'coploy api recruiter', version: '1.0.0' },
		components: { securitySchemes: { bearerAuth: { type: 'http' } } },
		paths,
	}
}

describe('filterPublicSpec', () => {
	it('inclui apenas operações com x-surface (fail-closed)', () => {
		const { spec, included, excluded } = filterPublicSpec(
			baseSpec({
				'/companies/jobs': {
					get: { 'x-surface': 'empresa', tags: ['jobs'] },
					post: { tags: ['jobs'] }, // sem marca → interna
				},
				'/rota/interna': {
					get: { tags: ['jobs'] },
				},
			}),
		)
		expect(included).toBe(1)
		expect(excluded).toBe(2)
		expect(spec.paths['/companies/jobs'].get).toBeDefined()
		expect(spec.paths['/companies/jobs'].post).toBeUndefined()
		expect(spec.paths['/rota/interna']).toBeUndefined()
	})

	it('conta operações por superfície', () => {
		const { bySurface } = filterPublicSpec(
			baseSpec({
				'/a': { get: { 'x-surface': 'empresa' } },
				'/b': { get: { 'x-surface': 'candidato' }, post: { 'x-surface': 'candidato' } },
				'/c': { get: { 'x-surface': 'publico' } },
				'/d': { get: { 'x-surface': 'integracoes' } },
			}),
		)
		expect(bySurface).toEqual({ empresa: 1, candidato: 2, publico: 1, integracoes: 1 })
	})

	it('rejeita valor de x-surface fora do enum', () => {
		expect(() =>
			filterPublicSpec(baseSpec({ '/a': { get: { 'x-surface': 'admin' } } })),
		).toThrow(PublicContractViolation)
	})

	it('rejeita path /admin ou /internal mesmo marcado de propósito', () => {
		expect(() =>
			filterPublicSpec(baseSpec({ '/admin/overview': { get: { 'x-surface': 'empresa' } } })),
		).toThrow(PublicContractViolation)
		expect(() =>
			filterPublicSpec(
				baseSpec({ '/internal/events/outbox/drain': { post: { 'x-surface': 'empresa' } } }),
			),
		).toThrow(PublicContractViolation)
	})

	it('estampa a versão própria do contrato e preserva securitySchemes', () => {
		const { spec } = filterPublicSpec(baseSpec({ '/a': { get: { 'x-surface': 'publico' } } }))
		expect(spec.info.version).toBe(PUBLIC_CONTRACT_VERSION)
		expect(spec.info.title).toBe('Coploy Public API')
		expect(spec.components.securitySchemes.bearerAuth).toBeDefined()
	})

	it('spec vazio de marcas produz artefato sem paths (e não explode)', () => {
		const { spec, included } = filterPublicSpec(baseSpec({ '/a': { get: {} } }))
		expect(included).toBe(0)
		expect(spec.paths).toEqual({})
	})
})
