import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'

/**
 * Skills com autocomplete canônico (V2-804).
 *
 * "React", "ReactJS" e "React.js" são a mesma coisa, e enquanto forem três
 * strings livres a busca por skill devolve um terço dos candidatos. O
 * autocomplete resolve isso na origem — na hora de escrever a vaga.
 *
 * ⚠️ Termo fora do dicionário **é aceito**. Bloquear empurraria o recrutador a
 * não descrever a vaga, e a descrição é o insumo de tudo o mais. O que não
 * casa entra na fila de curadoria do lado do servidor.
 *
 * O valor continua sendo a mesma string separada por vírgula que a vaga sempre
 * guardou: o campo mudou de aparência, não de contrato.
 */
export function SkillsInput({
	value,
	onChange,
}: {
	value: string
	onChange: (next: string) => void
}) {
	const { t } = useTranslation()
	const [query, setQuery] = useState('')
	const [focused, setFocused] = useState(false)

	const selected = useMemo(
		() =>
			value
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean),
		[value],
	)

	const { data } = empresa.useGetTaxonomySkills(
		{ q: query, limit: 8 },
		// só busca com algo digitado: lista inteira no foco é ruído
		{ query: { enabled: query.trim().length > 0 } },
	)

	const suggestions = ((data?.data as { skills?: Array<{ id: string; name: string }> } | undefined)
		?.skills ?? []
	).filter((skill) => !selected.some((item) => item.toLowerCase() === skill.name.toLowerCase()))

	function commit(next: string[]) {
		onChange(next.join(', '))
		setQuery('')
	}

	function add(name: string) {
		const clean = name.trim()
		if (!clean) return
		if (selected.some((item) => item.toLowerCase() === clean.toLowerCase())) {
			setQuery('')
			return
		}
		commit([...selected, clean])
	}

	return (
		<div className='relative'>
			<div className='flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5'>
				{selected.map((skill) => (
					<span
						key={skill}
						className='inline-flex items-center gap-1 rounded-md bg-lime-soft px-1.5 py-0.5 text-[12px] text-lime-fg'
					>
						{skill}
						<button
							type='button'
							onClick={() => commit(selected.filter((item) => item !== skill))}
							aria-label={t('jobForm.skillRemove', { skill })}
							className='opacity-60 transition-opacity hover:opacity-100'
						>
							<X size={11} />
						</button>
					</span>
				))}

				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						/*
						 * Blur adiado por dois motivos. O primeiro: clicar numa sugestão
						 * dispara blur antes do click, e fechar na hora mataria a lista
						 * debaixo do cursor.
						 *
						 * O segundo é um defeito que este campo introduziu ao virar chips
						 * — o texto digitado **não é mais o valor**. Quem escrevia
						 * "Kotlin" e clicava em Continuar perdia a skill em silêncio,
						 * porque o campo antigo guardava o que estava escrito e este não.
						 * Sair do campo agora confirma o que está pendente.
						 */
						setTimeout(() => {
							setFocused(false)
							if (query.trim()) add(query)
						}, 150)
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ',') {
							event.preventDefault()
							add(query)
						}
						if (event.key === 'Backspace' && !query && selected.length > 0) {
							commit(selected.slice(0, -1))
						}
					}}
					placeholder={selected.length === 0 ? 'Node.js, React, AWS' : ''}
					className='min-w-[120px] flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted'
				/>
			</div>

			{focused && query.trim() && (
				<ul className='absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-pop)]'>
					{suggestions.map((skill) => (
						<li key={skill.id}>
							<button
								type='button'
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => add(skill.name)}
								className='w-full px-2.5 py-1.5 text-left text-[12.5px] hover:bg-hover'
							>
								{skill.name}
							</button>
						</li>
					))}

					{/* termo livre sempre disponível: o dicionário não pode ser um muro */}
					<li>
						<button
							type='button'
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => add(query)}
							className={cn(
								'w-full px-2.5 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-hover',
								suggestions.length > 0 && 'border-t border-border-soft',
							)}
						>
							{t('jobForm.skillAddFree', { skill: query.trim() })}
						</button>
					</li>
				</ul>
			)}
		</div>
	)
}
