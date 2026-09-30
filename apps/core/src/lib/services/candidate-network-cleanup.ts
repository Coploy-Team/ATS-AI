import type { InfraProvider } from '@coploy/infra'

/**
 * Stub do espelho público.
 *
 * Na edição hospedada a anonimização apaga também o que o candidato publicou
 * na rede Coploy (perfil aberto, vitrine, projetos). Esta distribuição não
 * tem essas superfícies nem as tabelas delas: não há o que apagar.
 */
export async function removeCandidateNetworkData(_infra: InfraProvider, _userId: string): Promise<void> {}
