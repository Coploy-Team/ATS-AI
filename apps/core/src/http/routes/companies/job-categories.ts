import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { allowedJobCategories, baseJobCategories } from '@/lib/services/job-taxonomy'

/**
 * As áreas de vaga que esta empresa pode escolher.
 *
 * ⚠️ A empresa ACRESCENTA, não substitui. As áreas fixas são vocabulário
 * compartilhado: é por elas que o hunting e o portal público encontram vaga
 * entre empresas diferentes. Deixar um cliente renomear ou apagar uma delas
 * quebraria a busca dos outros e deixaria vaga antiga apontando para um nome que
 * deixou de existir — por isso a resposta separa as duas listas, e o PUT só
 * aceita a dela.
 */
export function jobCategoriesRoutes(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/job-categories',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Job categories available to this company',
					response: {
						200: z.object({
							/** As nossas — a tela mostra, não deixa editar. */
							base: z.array(z.string()),
							/** As que a empresa acrescentou. */
							custom: z.array(z.string()),
							/** As duas juntas, na ordem em que devem ser oferecidas. */
							all: z.array(z.string()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const base = baseJobCategories()
				const all = await allowedJobCategories(company.id, app.infra)
				return { base, custom: all.filter((c) => !base.includes(c)), all }
			},
		)
		.put(
			'/companies/job-categories',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Replace the categories this company added',
					body: z.object({
						/**
						 * A lista INTEIRA das áreas próprias — não um acréscimo.
						 *
						 * A tela sempre manda o conjunto completo, então remover é mandar
						 * sem o item. Um endpoint de "adicionar um" exigiria outro de
						 * "remover um" e uma terceira forma de ordenar.
						 *
						 * ⚠️ Sem `min(1)` de propósito: uma linha em branco no meio da lista
						 * derrubaria a gravação INTEIRA, e a pessoa perderia as outras vinte
						 * áreas por causa de um espaço. O handler normaliza — tira vazio,
						 * repetida e o que já é nosso — que é o lugar certo para isso.
						 */
						categories: z.array(z.string().max(60)).max(200),
					}),
					response: { 200: z.object({ custom: z.array(z.string()) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const base = baseJobCategories()

				/*
				 * Normaliza antes de gravar: sem vazio, sem repetida, e sem repetir uma
				 * que já é nossa — cadastrar "Tecnologia da Informação" de novo criaria
				 * duas opções idênticas no mesmo select, e a pessoa escolheria a errada
				 * metade das vezes.
				 */
				const vistas = new Set(base.map((c) => c.toLowerCase()))
				const custom: string[] = []
				for (const bruta of request.body.categories) {
					const area = bruta.trim()
					const chave = area.toLowerCase()
					if (!area || vistas.has(chave)) continue
					vistas.add(chave)
					custom.push(area)
				}

				await app.infra.companyRepository.updateCompany(company.id, {
					jobCategories: custom,
				} as never)

				return { custom }
			},
		)
}
