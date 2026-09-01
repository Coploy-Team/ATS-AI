import { BadRequestError } from '@coploy/shared/errors'

/**
 * Stub do espelho público.
 *
 * Na edição hospedada este token autentica contra APIs do Google. Esta
 * distribuição não fala com nenhuma: o portal de vagas é servido pelo próprio
 * stack, e a entrevista com IA é o plugin do Motor.
 */
export async function getAccessToken(): Promise<string> {
	throw new BadRequestError(
		'Esta distribuição não usa APIs do Google. O portal de vagas é servido pelo próprio stack.',
	)
}
