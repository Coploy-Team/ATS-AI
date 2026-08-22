import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { stripeService } from '@/lib/stripe'
import { CreateCheckoutSessionRequestSchema } from '@/schemas/billing-schema'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { UnauthorizedError } from '@coploy/shared/errors'
import type { User } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

export function createCheckoutSessionDreamJobs(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .post(
      '/dream-jobs/billing/checkout',
      {
        schema: {
          'x-surface': 'candidato',
          tags: ['dream_jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Create a Stripe checkout session for dream jobs billing',
          body: CreateCheckoutSessionRequestSchema,
          response: {
            201: z.object({
              sessionId: z.string(),
              url: z.string(),
              customerId: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const {
          priceId,
          successUrl,
          cancelUrl,
          mode,
          quantity,
          currency,
        } = request.body

        const userId = await request.getCurrentUser()

        const user = (await dreamJobsService.getUser(userId)) as User | null
        if (!user) throw new UnauthorizedError('Usuário não encontrado')

        // Verificar/gerar customer no Stripe
        let customerId = user?.paymentDetails?.stripeCustomerId
        if (!customerId) {
          const customer = await stripeService.createCustomer({
            email: user.email || '',
            name: user.display_name ?? '',
            metadata: {
              priceId: priceId,
              userId,
            },
          })

          customerId = customer.id

          // Atualizar empresa no Firestore com o customer ID (via dot-notation para não sobrescrever o objeto)
          await dreamJobsService.updateUser(userId, {
            'paymentDetails.stripeCustomerId': customerId,
          })
        }

        try {
          // Buscar o preço original com o produto expandido
          const originalPrice = await stripeService.getPrice(priceId)
          if (!originalPrice) {
            throw new BadRequestError('Preço não encontrado no Stripe')
          }

          // Validar compatibilidade do preço original com o mode
          if (mode === 'subscription' && originalPrice.type !== 'recurring') {
            throw new BadRequestError(
              'O preço selecionado não é compatível com subscription. Selecione um preço recorrente.'
            )
          }
          if (mode === 'payment' && originalPrice.type === 'recurring') {
            throw new BadRequestError(
              'O preço selecionado não é compatível com payment único. Selecione um preço não recorrente.'
            )
          }

          // Obter o ID do produto
          const productId =
            typeof originalPrice.product === 'string'
              ? originalPrice.product
              : originalPrice.product.id

          const originalCurrency = originalPrice.currency.toLowerCase()
          const requestedCurrency = currency
            ? currency.toLowerCase()
            : originalCurrency

          // Determinar o tipo de preço necessário
          const priceType = mode === 'subscription' ? 'recurring' : 'one_time'

          let finalPriceId = priceId

          if (currency) {
            if (originalCurrency === requestedCurrency) {
              finalPriceId = priceId
            } else {
              const allPricesInCurrency =
                await stripeService.getPricesByProductAndCurrency(
                  productId,
                  requestedCurrency
                )

              const pricesWithType = allPricesInCurrency.filter(
                (p) =>
                  p.currency.toLowerCase() ===
                    requestedCurrency.toLowerCase() &&
                  ((priceType === 'recurring' && p.type === 'recurring') ||
                    (priceType === 'one_time' && p.type === 'one_time'))
              )

              if (pricesWithType.length === 0) {
                throw new BadRequestError(
                  `Preço não disponível na moeda ${requestedCurrency.toUpperCase()}. ` +
                    `O produto possui preços apenas na moeda ${originalCurrency.toUpperCase()}.`
                )
              }

              const originalPriceInList = pricesWithType.find(
                (p) => p.id === priceId
              )

              if (originalPriceInList) {
                finalPriceId = priceId
              } else {
                finalPriceId = pricesWithType[0].id
              }
            }
          }

          const finalPrice = await stripeService.getPrice(finalPriceId)
          if (!finalPrice) {
            throw new BadRequestError('Preço final não encontrado no Stripe')
          }

          const finalPriceCurrency = finalPrice.currency.toLowerCase()

          if (currency) {
            if (finalPriceCurrency !== requestedCurrency) {
              if (
                originalCurrency === requestedCurrency &&
                priceId !== finalPriceId
              ) {
                const originalPriceRecheck =
                  await stripeService.getPrice(priceId)
                if (
                  originalPriceRecheck &&
                  originalPriceRecheck.currency.toLowerCase() ===
                    requestedCurrency
                ) {
                  finalPriceId = priceId
                } else {
                  throw new BadRequestError(
                    `Preço final (${finalPriceId}) não está na moeda solicitada ${requestedCurrency.toUpperCase()}. ` +
                      `Moeda encontrada: ${finalPriceCurrency.toUpperCase()}. ` +
                      `PriceId original (${priceId}) também não está na moeda correta.`
                  )
                }
              } else {
                throw new BadRequestError(
                  `Preço final (${finalPriceId}) não está na moeda solicitada ${requestedCurrency.toUpperCase()}. ` +
                    `Moeda encontrada: ${finalPriceCurrency.toUpperCase()}.`
                )
              }
            }
          }

          // Criar checkout session com o priceId (original ou da moeda solicitada)
          const session = await stripeService.createCheckoutSession({
            customerId,
            priceId: finalPriceId,
            successUrl,
            cancelUrl,
            mode,
            quantity,
            metadata: {
              priceId: finalPriceId,
              originalPriceId: priceId,
              quantity: String(quantity),
              userId,
              requestedCurrency,
            },
          })

          return reply.status(201).send({
            sessionId: session.id,
            url: session.url!,
            customerId,
          })
        } catch (error) {
          throw new BadRequestError(
            `Erro ao criar sessão de checkout: ${error as string}`
          )
        }
      }
    )
}
