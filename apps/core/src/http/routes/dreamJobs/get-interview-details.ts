import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { JobApplied } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { NotFoundError } from '@coploy/shared/errors'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'
import { createProfileInterviewService } from '@/lib/services/profile-interview-service'

// Schema de resposta detalhada da entrevista
const interviewDetailsResponseSchema = z.object({
  hasInterview: z.boolean(),
  interview: z
    .object({
      // Dados básicos
      jobId: z.string(),
      jobAppliedId: z.string(),
      jobName: z.string().nullable(),
      jobLevel: z.string().nullable(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
      status: z.string(),

      // Scores principais
      score: z.number().nullable(),
      scom: z.number().nullable(), // Comunicação
      sres: z.number().nullable(), // Resiliência
      stec: z.number().nullable(), // Técnico

      // Scores detalhados
      aderencia_descricao: z.number().nullable(),
      alinhamento_responsabilidades: z.number().nullable(),
      requisitos_atendidos: z.number().nullable(),
      alinhamento_nivel: z.number().nullable(),
      gap_para_proximo_nivel: z.number().nullable(),
      estruturacao: z.number().nullable(),
      exemplificacao: z.number().nullable(),
      profundidade: z.number().nullable(),
      nivel_confianca: z.number().nullable(),

      // Feedbacks
      generalFeedback: z.string().nullable(),
      generalStrengths: z.array(z.string()).nullable(),
      generalImprovement: z.array(z.string()).nullable(),
      recomentation: z.string().nullable(),

      // Avaliação final (se disponível)
      avaliacaoFinal: z
        .object({
          competencias_criticas: z
            .array(
              z.object({
                nome: z.string(),
                pontuacao: z.number(),
                pontos_fortes: z.array(z.string()),
                pontos_desenvolvimento: z.array(z.string()),
              })
            )
            .nullable(),
          competencias_adicionais: z
            .array(
              z.object({
                nome: z.string(),
                pontuacao: z.number(),
                pontos_fortes: z.array(z.string()),
                pontos_desenvolvimento: z.array(z.string()),
              })
            )
            .nullable(),
          atendimento_expectativas: z
            .array(
              z.object({
                nome: z.string(),
                nivel_atendimento: z.number(),
                evidencias: z.array(z.string()),
                gaps: z.array(z.string()),
              })
            )
            .nullable(),
          recomendacoes: z
            .object({
              pontos_fortes: z.array(z.string()),
              areas_desenvolvimento: z.array(z.string()),
              sugestoes_melhoria: z.array(z.string()),
            })
            .nullable(),
          generalFeedback: z.string().nullable(),
          generalRecomendation: z.string().nullable(),
          score: z.number().nullable(),
          pontuacao_final: z.number().nullable(),
          nivel: z.string().nullable(),
          resumo: z.string().nullable(),
        })
        .nullable(),

      // Detalhes por pergunta (resumido)
      questionsCount: z.number(),
      questions: z
        .array(
          z.object({
            id: z.string(),
            question: z.string(),
            score: z.number().nullable(),
            feedback: z.string().nullable(),
            strengths: z.array(z.string()).nullable(),
            improvement: z.array(z.string()).nullable(),
            /*
             * A GRAVAÇÃO. O candidato só podia rever a entrevista abrindo outro
             * app; o vídeo de cada resposta já estava salvo e não saía daqui.
             * Rever a si mesmo respondendo é o material mais útil que ele tem —
             * mais do que qualquer texto sobre a resposta.
             */
            videoUrl: z.string().nullable(),
            audioUrl: z.string().nullable(),
            /** O que ele disse, transcrito — para ler quando não dá pra assistir. */
            answer: z.string().nullable(),
            /** Legenda com marcação de tempo: é o que liga o CC no player. */
            captionSegments: z
              .array(z.object({ start: z.number(), end: z.number(), text: z.string() }))
              .nullable(),
            recommendation: z.string().nullable(),
            skills: z.array(z.string()).nullable(),
          })
        )
        .nullable(),
    })
    .nullable(),
})

export function getInterviewDetails(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)
  const profileInterviewService = createProfileInterviewService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .get(
      '/dream-jobs/interview-details',
      {
        schema: {
          'x-surface': 'candidato',
          tags: ['dream_jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Get detailed interview results for the candidate',
          description:
            'Retrieves complete interview details including scores, feedbacks and evaluation',
          response: {
            200: interviewDetailsResponseSchema,
            404: z.object({
              message: z.string(),
            }),
            400: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const userId = await request.getCurrentUser()

        // Buscar dados do usuário para pegar o dreamJobsInterview
        const user = await dreamJobsService.getUser(userId) as {
          dreamJobsInterview?: {
            jobId: string
            jobAppliedId?: string
            createdAt: { toDate: () => Date }
            status: string
            completedAt?: { toDate: () => Date }
            generalFeedback?: string
          }
        } | null

        if (!user) {
          throw new NotFoundError('User not found')
        }

        if (!user.dreamJobsInterview) {
          return reply.status(200).send({
            hasInterview: false,
            interview: null,
          })
        }

        /*
         * A entrevista vem do SERVICE, não do ponteiro.
         *
         * `dreamJobsInterview` guarda o `jobId` mas quase nunca o
         * `jobAppliedId`, e o `status` dele nasce `pending` e nunca avança —
         * só a rota de progresso o escreve, e ela depende do app de entrevista
         * chamá-la. Com a condição abaixo lendo o espelho, o candidato que
         * terminou a entrevista caía SEMPRE no retorno básico: a tela recebia
         * `hasInterview: true` com tudo nulo e não mostrava nada.
         */
        const perfil = await profileInterviewService
          .getStatus(userId)
          .catch(() => null)

        const { jobId, createdAt, completedAt } = user.dreamJobsInterview
        const jobAppliedId = perfil?.jobAppliedId ?? user.dreamJobsInterview.jobAppliedId
        const status = perfil?.status ?? user.dreamJobsInterview.status

        // Sem o documento da entrevista não há o que detalhar
        if (!jobAppliedId || status !== 'completed') {
          return reply.status(200).send({
            hasInterview: true,
            interview: {
              jobId,
              jobAppliedId: jobAppliedId || '',
              jobName: null,
              jobLevel: null,
              createdAt:
                createdAt?.toDate?.()?.toISOString() ||
                new Date().toISOString(),
              completedAt: completedAt?.toDate?.()?.toISOString() || null,
              status,
              score: null,
              scom: null,
              sres: null,
              stec: null,
              aderencia_descricao: null,
              alinhamento_responsabilidades: null,
              requisitos_atendidos: null,
              alinhamento_nivel: null,
              gap_para_proximo_nivel: null,
              estruturacao: null,
              exemplificacao: null,
              profundidade: null,
              nivel_confianca: null,
              generalFeedback: user.dreamJobsInterview.generalFeedback || null,
              generalStrengths: null,
              generalImprovement: null,
              recomentation: null,
              avaliacaoFinal: null,
              questionsCount: 0,
              questions: null,
            },
          })
        }

        // Buscar dados completos do jobApplied
        const jobApplied = await dreamJobsService.getJobApplied(userId, jobAppliedId) as JobApplied | null

        if (!jobApplied) {
          throw new BadRequestError('Interview data not found')
        }

        const interview = jobApplied.interview

        // Processar perguntas (resumido)
        const comoLista = (valor: unknown): string[] | null => {
          if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === 'string')
          return typeof valor === 'string' && valor ? [valor] : null
        }

        const questions =
          interview?.info?.map((q) => {
            const item = q as typeof q & {
              answer?: string
              video?: string
              audio?: string
              qRecomendation?: string
              skills?: unknown
              captionSegments?: unknown
            }
            return {
              id: item.id ?? '',
              question: item.question ?? '',
              score: item.score ?? null,
              feedback: item.feedback ?? null,
              strengths: comoLista(item.strengths),
              improvement: comoLista(item.improvement),
              videoUrl: item.video ?? null,
              audioUrl: item.audio ?? null,
              answer: item.answer ?? null,
              captionSegments: Array.isArray(item.captionSegments)
                ? (item.captionSegments as Array<{ start: number; end: number; text: string }>)
                : null,
              recommendation: item.qRecomendation ?? null,
              skills: comoLista(item.skills),
            }
          }) || null

        // Converter score para número se for string (com fallback para jobApplied.score)
        const rawScore = interview?.score ?? jobApplied.score
        const parseScore = (
          value: string | number | null | undefined
        ): number | null => {
          if (value === null || value === undefined) return null
          const num =
            typeof value === 'string' ? Number.parseFloat(value) : value
          return Number.isNaN(num) ? null : num
        }
        const scoreValue = parseScore(rawScore)
        // Avaliação final não é utilizada - dados já estão no jobApplied e interview
        const avaliacaoFinal = null

        // Normalizar generalStrengths e generalImprovement para arrays
        const normalizeToArray = (
          value: string | string[] | null | undefined
        ): string[] | null => {
          if (!value) return null
          if (Array.isArray(value)) return value
          if (typeof value === 'string') return [value]
          return null
        }

        return reply.status(200).send({
          hasInterview: true,
          interview: {
            jobId,
            jobAppliedId,
            jobName: interview?.job || jobApplied.job || null,
            jobLevel: interview?.leveljob || jobApplied.leveljob || null,
            createdAt:
              createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            completedAt:
              completedAt?.toDate?.()?.toISOString() || perfil?.completedAt || null,
            status,

            // Scores principais
            score: scoreValue,
            scom: interview?.scom ?? jobApplied.scom ?? null,
            sres: interview?.sres ?? jobApplied.sres ?? null,
            stec: interview?.stec ?? jobApplied.stec ?? null,

            // Scores detalhados
            aderencia_descricao: interview?.aderencia_descricao ?? null,
            alinhamento_responsabilidades:
              interview?.alinhamento_responsabilidades ?? null,
            requisitos_atendidos:
              interview?.requisitos_atendidos ??
              jobApplied.requisitos_atendidos ??
              null,
            alinhamento_nivel: interview?.alinhamento_nivel ?? null,
            gap_para_proximo_nivel: interview?.gap_para_proximo_nivel ?? null,
            estruturacao: interview?.estruturacao ?? null,
            exemplificacao: interview?.exemplificacao ?? null,
            profundidade:
              interview?.profundidade ?? jobApplied.profundidade ?? null,
            nivel_confianca:
              interview?.nivel_confianca ?? jobApplied.nivel_confianca ?? null,

            // Feedbacks
            generalFeedback:
              interview?.generalFeedback ||
              user.dreamJobsInterview.generalFeedback ||
              null,
            generalStrengths: normalizeToArray(interview?.generalStrengths),
            generalImprovement: normalizeToArray(interview?.generalImprovement),
            recomentation:
              interview?.recomentation ?? jobApplied.recomentation ?? null,

            // Avaliação final
            avaliacaoFinal,

            // Perguntas
            questionsCount: interview?.info?.length || 0,
            questions,
          },
        })
      }
    )
}
