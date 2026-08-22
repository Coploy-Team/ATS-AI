import { ClipboardCheck, DoorOpen, Mic, MessageSquare, Smile, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageFlag, baseLanguage } from '@/ui/language-flag'

/**
 * Como esta entrevista foi feita: tipo, modo e idioma.
 *
 * Fica no **header**, junto do nome e da nota, porque é contexto de leitura —
 * não um detalhe a caçar. Sem isso, quem abre a gravação não sabe se está
 * ouvindo uma entrevista técnica, uma avaliação ou um desligamento, nem se foi
 * por vídeo, voz ou WhatsApp. E isso muda o julgamento: silêncio num vídeo é
 * hesitação; no WhatsApp é o canal.
 *
 * Ícone + rótulo, não só ícone. Ícone sozinho obriga a decorar convenção — e
 * "avaliação" e "entrevista" não têm desenho óbvio que os separe.
 */

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
	interview: MessageSquare,
	evaluation: ClipboardCheck,
	emotional: Smile,
	exitJob: DoorOpen,
	whatsapp: MessageSquare,
}

const MODE_ICONS: Record<string, typeof Video> = {
	video: Video,
	voice: Mic,
	whatsapp: MessageSquare,
}

function Badge({
	icon: Icon,
	children,
	leading,
}: {
	icon?: typeof Video
	children: React.ReactNode
	/** Slot para a bandeira — mesma primitiva da tela de Vagas. */
	leading?: React.ReactNode
}) {
	return (
		<span className='inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-[3px] text-[11.5px] text-text-2'>
			{leading}
			{Icon ? <Icon size={11.5} className='shrink-0 text-muted' /> : null}
			{children}
		</span>
	)
}

export function InterviewBadges({
	typeInterview,
	interviewMode,
	language,
}: {
	typeInterview?: string | null
	interviewMode?: string | null
	language?: string | null
}) {
	const { t } = useTranslation()

	const base = language ? baseLanguage(language) : ''

	if (!typeInterview && !interviewMode && !base) return null

	return (
		<span className='flex flex-wrap items-center gap-1.5'>
			{typeInterview && (
				<Badge icon={TYPE_ICONS[typeInterview]}>
					{t(`interviewKind.type.${typeInterview}`, { defaultValue: typeInterview })}
				</Badge>
			)}

			{interviewMode && (
				<Badge icon={MODE_ICONS[interviewMode]}>
					{t(`interviewKind.mode.${interviewMode}`, { defaultValue: interviewMode })}
				</Badge>
			)}

			{base && (
				<Badge leading={<LanguageFlag language={language} />}>
					{t(`interviewKind.language.${base}`, { defaultValue: language ?? '' })}
				</Badge>
			)}
		</span>
	)
}
