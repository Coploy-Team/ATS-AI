import { z } from 'zod'

// Schema para HardSkills
export const hardSkillSchema = z
	.object({
		categoria: z.string().nullable().optional(),
		tag: z.string().nullable().optional(),
		area: z.string().nullable().optional(),
		pontuacao: z.number().nullable().optional(),
		nivel_evidencia: z.string().nullable().optional(),
		evidencia: z.string().nullable().optional(),
		contexto_uso: z.string().nullable().optional(),
		palavras_chave: z.array(z.string()).nullable().optional(),
		tempo_experiencia: z.string().nullable().optional(),
		necessita_validacao: z.boolean().nullable().optional(),
	})
	.nullable()

// Schema para SoftSkills
export const softSkillSchema = z
	.object({
		categoria: z.string().nullable().optional(),
		tag: z.string().nullable().optional(),
		pontuacao: z.number().nullable().optional(),
		evidencia: z.string().nullable().optional(),
		contexto: z.string().nullable().optional(),
		impacto: z.string().nullable().optional(),
	})
	.nullable()

// Schema para Senioridade
export const senioridadeSchema = z
	.object({
		nivel_identificado: z.string().nullable().optional(),
		confianca_avaliacao: z.number().nullable().optional(),
		justificativa: z.string().nullable().optional(),
		fatores_principais: z.array(z.string()).nullable().optional(),
	})
	.nullable()

// Schema para Papel Potencial
export const papelPotencialSchema = z.object({
	papel: z.string().nullable().optional(),
	fit: z.number().nullable().optional(),
	justificativa: z.string().nullable().optional(),
})

// Schema para Market Fit
export const marketFitSchema = z
	.object({
		tipos_empresa_ideais: z.array(z.string()).nullable().optional(),
		porte_empresa: z.array(z.string()).nullable().optional(),
		culturas_adequadas: z.array(z.string()).nullable().optional(),
		papeis_potenciais: z.array(papelPotencialSchema).nullable().optional(),
	})
	.nullable()

// Schema para Perfil Técnico
export const perfilTecnicoSchema = z.object({
	tipo: z.string().nullable().optional(),
	amplitude: z.number().nullable().optional(),
	profundidade: z.number().nullable().optional(),
	atualizacao: z.string().nullable().optional(),
})

// Schema para Perfil Comportamental
export const perfilComportamentalSchema = z.object({
	tipo_predominante: z.string().nullable().optional(),
	trabalho_em_equipe: z.number().nullable().optional(),
	comunicacao: z.number().nullable().optional(),
	proatividade: z.number().nullable().optional(),
	resiliencia: z.number().nullable().optional(),
})

// Schema para Estilo de Aprendizado
export const estiloAprendizadoSchema = z.object({
	tipo: z.string().nullable().optional(),
	velocidade: z.string().nullable().optional(),
	preferencia: z.string().nullable().optional(),
	curiosidade_tecnica: z.number().nullable().optional(),
})

// Schema para Classificação
export const classificacaoSchema = z
	.object({
		perfil_tecnico: perfilTecnicoSchema.optional(),
		perfil_comportamental: perfilComportamentalSchema.optional(),
		estilo_aprendizado: estiloAprendizadoSchema.optional(),
	})
	.nullable()

// Schema para Gap Técnico
export const gapTecnicoSchema = z.object({
	area: z.string().nullable().optional(),
	descricao: z.string().nullable().optional(),
	criticidade: z.string().nullable().optional(),
	recomendacao: z.string().nullable().optional(),
})

// Schema para Gap Comportamental
export const gapComportamentalSchema = z.object({
	area: z.string().nullable().optional(),
	descricao: z.string().nullable().optional(),
	criticidade: z.string().nullable().optional(),
	recomendacao: z.string().nullable().optional(),
})

// Schema para Red Flag
export const redFlagSchema = z.object({
	tipo: z.string().nullable().optional(),
	descricao: z.string().nullable().optional(),
	severidade: z.string().nullable().optional(),
	evidencia: z.string().nullable().optional(),
})

// Schema para Gaps
export const gapsSchema = z
	.object({
		tecnicos: z.array(gapTecnicoSchema).nullable().optional(),
		comportamentais: z.array(gapComportamentalSchema).nullable().optional(),
		red_flags: z.array(redFlagSchema).nullable().optional(),
	})
	.nullable()

// Schema para Resumo Executivo
export const resumoExecutivoSchema = z
	.object({
		pontos_fortes: z.array(z.string()).nullable().optional(),
		pontos_desenvolvimento: z.array(z.string()).nullable().optional(),
		recomendacao_final: z.string().nullable().optional(),
		score_geral: z.number().nullable().optional(),
	})
	.nullable()

// Schema principal para Interview Tags
export const interviewTagsSchema = z
	.object({
		interview_id: z.string().nullable().optional(),
		created_at: z.date().nullable().optional(),
		job_name: z.string().nullable().optional(),
		hard_skills: z.array(hardSkillSchema).nullable().optional(),
		soft_skills: z.array(softSkillSchema).nullable().optional(),
		senioridade: senioridadeSchema.optional(),
		market_fit: marketFitSchema.optional(),
		classificacao: classificacaoSchema.optional(),
		gaps: gapsSchema.optional(),
		resumo_executivo: resumoExecutivoSchema.optional(),
	})
	.nullable()
