import type { CandidateProfile } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * Export do perfil no formato OTS 0.1 (V2-702).
 *
 * A spec obriga o Profile Producer a oferecer o export completo ao talento
 * (§2.4.4, item 3): portabilidade **é** o produto — e também LGPD Art. 18 /
 * GDPR Art. 20. Só existe do lado do candidato; nenhuma rota equivalente na
 * superfície da empresa, porque não é dado da empresa.
 *
 * Duas regras da spec que este mapeamento aplica sem exceção:
 *
 * - **Atributos protegidos nunca saem** (§2.4.4, item 1): CPF, data de
 *   nascimento, gênero, raça. Não é filtro de conveniência — é o que impede
 *   que um consumidor do arquivo use esses atributos em ranking. O que não está
 *   no documento não pode ser usado.
 * - **`fieldSources` viaja junto** (§3): sem proveniência, quem importar não
 *   consegue respeitar a regra de não sobrescrever dado digitado pela pessoa
 *   com dado automático.
 */

export const OTS_VERSION = '0.1'

/**
 * Allowlist explícita, não denylist.
 *
 * Campo novo no `CandidateProfile` **não** entra no export sozinho: com
 * denylist, adicionar `birthDate` ao domain vazaria data de nascimento no
 * próximo deploy sem ninguém perceber. Fail-closed, como o contrato público.
 */
const SCALAR_FIELDS = [
	'name',
	'email',
	'phone',
	'photoUrl',
	'headline',
	'summary',
	'occupation',
	'level',
	'yearsOfExperience',
	'professionalObjectives',
	'company',
	'location',
	'countryOfResidence',
	'countriesOfInterest',
	'skills',
	'resumeUrl',
	'linkedinUrl',
	'completeness',
] as const

const LIST_FIELDS = ['experiences', 'education', 'languages', 'certifications'] as const

export type OtsProfileExport = {
	otsVersion: string
	exportedAt: string
	profile: Record<string, unknown>
}

export function createOtsExportService(infra: InfraProvider) {
	return {
		/**
		 * Perfil do titular no formato OTS. Sempre 200 com perfil possivelmente
		 * vazio: currículo por começar é um estado, não um erro.
		 */
		async exportProfile(userId: string): Promise<OtsProfileExport> {
			const [profile, user] = await Promise.all([
				Promise.resolve(infra.userRepository.getCandidateProfile(userId)).catch(() => null),
				Promise.resolve(infra.userRepository.getUser(userId)).catch(() => null),
			])

			const source = (profile ?? {}) as unknown as Record<string, unknown>
			const identity = (user ?? {}) as unknown as Record<string, unknown>

			const exported: Record<string, unknown> = { id: userId }

			for (const field of SCALAR_FIELDS) {
				exported[field] = source[field] ?? null
			}

			// nome/foto/e-mail moram na identidade quando o currículo não os tem
			exported.name = exported.name ?? identity.display_name ?? null
			exported.email = exported.email ?? identity.email ?? null
			exported.phone = exported.phone ?? identity.phone_number ?? null
			exported.photoUrl = exported.photoUrl ?? identity.photo_url ?? null

			for (const field of LIST_FIELDS) {
				const value = source[field]
				exported[field] = Array.isArray(value) ? value : []
			}

			exported.fieldSources = (source.fieldSources as Record<string, unknown>) ?? null
			exported.missingFields = Array.isArray(source.missingFields) ? source.missingFields : []

			return {
				otsVersion: OTS_VERSION,
				exportedAt: new Date().toISOString(),
				profile: exported,
			}
		},
	}
}

export type { CandidateProfile }
