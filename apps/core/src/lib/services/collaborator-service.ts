import type { InfraProvider } from '@coploy/infra'
import type { Collaborator, QueryFilter, UsersCompany } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { firebaseAdminAuth } from '@/lib/init'

export function createCollaboratorService(infra: InfraProvider) {
  return {
    async createCollaborator(companyId: string, data: Record<string, unknown>) {
      return infra.collaboratorRepository.createCollaborator(companyId, data)
    },
    async listCollaborators(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.collaboratorRepository.listCollaborators(companyId, options)
    },
    async createUser(data: { email: string; password: string; displayName: string }) {
      return infra.auth.createUser(data)
    },
    async createUsersCompany(data: Record<string, unknown>, uid: string) {
      return infra.userRepository.createUsersCompany(data, uid)
    },

    /**
     * A linha de quem está OLHANDO a tela, quando ela não veio da coleção.
     *
     * O cadastro de empresa grava `is_owner: true` no documento do usuário e não
     * cria colaborador — então quem abre a conta não se vê na própria tela de
     * Time. Sintetizar na leitura (e não só no cadastro) cobre as empresas que
     * já existem sem backfill.
     *
     * Devolve `null` quando não há o que acrescentar: sem usuário, sem e-mail,
     * ou quando o filtro ativo excluiria essa pessoa de qualquer forma.
     */
    async buildSelfCollaborator(
      userId: string,
      filtros: { accessLevel: string; status: string },
    ) {
      const eu = (await infra.userRepository.getUsersCompany(userId).catch(() => null)) as
        | (UsersCompany & { is_owner?: boolean; created_time?: Date | { toDate?: () => Date } })
        | null

      if (!eu?.email) return null

      const accessLevel = eu.is_owner ? 'owner' : 'editor'
      const excluidoPeloFiltro =
        (filtros.accessLevel !== 'all' && filtros.accessLevel !== accessLevel) ||
        filtros.status === 'inactive'

      if (excluidoPeloFiltro) return null

      const criadoEm = eu.created_time as { toDate?: () => Date } | undefined
      return {
        id: userId,
        accessLevel: accessLevel as 'owner' | 'editor',
        creationDate:
          typeof criadoEm?.toDate === 'function'
            ? criadoEm.toDate()
            : new Date((eu.created_time as unknown as string) ?? Date.now()),
        email: eu.email,
        name: eu.display_name || eu.email,
        status: true,
        userRef: userId,
      }
    },

    /**
     * Returns owner + active non-shared collaborators for a company.
     * ownerUserId is the owner's user ID (from company.ownerCompany.id).
     */
    async getCreators(companyId: string, ownerUserId?: string) {
      const creators: Array<{
        id: string
        name: string
        email: string
        isOwner: boolean
      }> = []

      if (ownerUserId) {
        try {
          const owner = (await infra.userRepository.getUsersCompany(ownerUserId)) as UsersCompany | null
          if (owner) {
            creators.push({
              id: owner.id,
              name: owner.display_name || owner.email?.split('@')[0] || 'Nome não informado',
              email: owner.email || '',
              isOwner: true,
            })
          }
        } catch (error) {
          console.error('Erro ao buscar owner:', error)
        }
      }

      try {
        const collaborators = (await infra.collaboratorRepository.listCollaborators(companyId, {
          filters: [{ field: 'status', operator: '==', value: true }],
        })) as unknown as Collaborator[]

        for (const collaborator of collaborators) {
          if (
            collaborator.userRef?.id &&
            collaborator.userRef.id !== ownerUserId &&
            collaborator.accessLevel !== 'shared'
          ) {
            creators.push({
              id: collaborator.userRef.id,
              name: collaborator.name || '',
              email: collaborator.email || '',
              isOwner: false,
            })
          }
        }
      } catch (error) {
        console.error('Erro ao buscar colaboradores:', error)
      }

      return { creators }
    },

    /**
     * Deletes a collaborator: removes infra records and Firebase Auth user.
     */
    async deleteCollaborator(companyId: string, collaboratorId: string) {
      const collaborator = (await infra.collaboratorRepository.getCollaborator(
        companyId,
        collaboratorId,
      )) as Collaborator | null

      if (!collaborator) {
        throw new Error('Collaborator not found')
      }

      const userRefId =
        typeof collaborator.userRef === 'string'
          ? collaborator.userRef
          : (collaborator.userRef as { id?: string })?.id

      if (!userRefId) {
        throw new Error('Collaborator userRef not found')
      }

      const userCompany = (await infra.userRepository.getUsersCompany(userRefId)) as UsersCompany | null

      if (!userCompany) {
        throw new Error('User company record not found')
      }

      await infra.collaboratorRepository.deleteCollaborator(companyId, collaboratorId)
      await infra.userRepository.deleteUsersCompany(userRefId)

      try {
        await firebaseAdminAuth.deleteUser(userRefId)
      } catch (error) {
        throw new BadRequestError(error as string)
      }
    },

    /**
     * Updates a collaborator and returns the updated record.
     */
    async updateCollaborator(
      companyId: string,
      collaboratorId: string,
      data: Record<string, unknown>,
    ) {
      const existing = (await infra.collaboratorRepository.getCollaborator(
        companyId,
        collaboratorId,
      )) as Collaborator | null

      if (!existing) {
        throw new Error('Collaborator not found')
      }

      await infra.collaboratorRepository.updateCollaborator(companyId, collaboratorId, data)

      const updated = (await infra.collaboratorRepository.getCollaborator(
        companyId,
        collaboratorId,
      )) as Collaborator | null

      if (!updated) {
        throw new Error('Failed to retrieve updated collaborator')
      }

      return { collaborator: updated }
    },
  }
}
