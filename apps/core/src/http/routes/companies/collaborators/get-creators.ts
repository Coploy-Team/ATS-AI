import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createCollaboratorService } from '@/lib/services/collaborator-service'
import type { Company, EntityRef } from '@coploy/domain'

export function getCreators(app: FastifyInstance) {
  const collaboratorSvc = createCollaboratorService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/creators',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['collaborators'],
          security: [{ bearerAuth: [] }],
          summary: 'Get all creators (owner + active collaborators)',
          response: {
            200: z.object({
              creators: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  email: z.string(),
                  isOwner: z.boolean(),
                })
              ),
            }),
          },
        },
      },
      async (request) => {
        const { company: _company } = await request.getUserMembership()
        const company = _company as Company

        const getOwnerCompanyId = (oc: EntityRef | string | null | undefined): string | undefined => {
          if (!oc) return undefined
          if (typeof oc === 'string') return oc
          return oc.id
        }

        return collaboratorSvc.getCreators(company.id, getOwnerCompanyId(company.ownerCompany))
      }
    )
}
