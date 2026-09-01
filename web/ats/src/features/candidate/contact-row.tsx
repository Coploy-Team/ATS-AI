import { Check, Copy, Linkedin, Mail, MessageCircle, Phone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Só dígitos, com DDI.
 *
 * O telefone chega formatado ("+55 (11) 98176-8304") e o `wa.me` só aceita
 * dígitos. Número brasileiro salvo sem DDI (10 ou 11 dígitos) ganha o 55 —
 * sem isso o link abre uma conversa com um número inexistente, que é pior que
 * não ter link.
 */
export function whatsappHref(phone: string): string | null {
	const digits = phone.replace(/\D/g, '')
	if (digits.length < 10) return null
	const full = digits.length <= 11 ? `55${digits}` : digits
	return `https://wa.me/${full}`
}

/**
 * Contato do candidato.
 *
 * O v1 tinha e o v2 não: sem isto, decidir "avançar" não tem continuação —
 * o recrutador descobre que precisa falar com a pessoa e vai procurar o
 * telefone em outra tela. WhatsApp primeiro porque é como recrutamento
 * acontece no Brasil.
 */
export function ContactActions({
	email,
	phone,
	linkedinUrl,
}: {
	email: string | null
	phone: string | null
	/** Perfil do LinkedIn — o recrutador confere trajetória fora da nossa base. */
	linkedinUrl?: string | null
}) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState<string | null>(null)

	const wa = phone ? whatsappHref(phone) : null
	if (!email && !phone && !linkedinUrl) return null

	function copy(value: string) {
		void navigator.clipboard.writeText(value)
		setCopied(value)
		setTimeout(() => setCopied(null), 1600)
	}

	return (
		<div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
			{/*
			 * Só o ÍCONE carrega a cor da marca.
			 *
			 * Botão inteiro preenchido competia com "Avançar" pela atenção — e
			 * abrir uma conversa não é a ação principal desta tela. Cor de marca
			 * (WhatsApp verde, LinkedIn azul) é literal de propósito: não são
			 * cores do produto, são identificação de terceiro.
			 */}
			{wa && (
				<a
					href={wa}
					target='_blank'
					rel='noreferrer'
					className='inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
				>
					<MessageCircle size={12} className='text-[#25D366]' /> {t('candidate.whatsapp')}
				</a>
			)}

			{phone && (
				<button
					onClick={() => copy(phone)}
					title={t('candidate.copyPhone')}
					className='inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
				>
					{copied === phone ? (
						<Check size={12} className='text-lime-fg' />
					) : (
						<Phone size={12} />
					)}
					{phone}
				</button>
			)}

			{linkedinUrl && (
				<a
					href={linkedinUrl}
					target='_blank'
					rel='noreferrer'
					className='inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
				>
					<Linkedin size={12} className='text-[#0A66C2]' /> LinkedIn
				</a>
			)}

			{email && (
				<a
					href={`mailto:${email}`}
					className='inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-lg border border-border px-2 text-[11.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
				>
					<Mail size={12} className='shrink-0' />
					<span className='truncate'>{email}</span>
				</a>
			)}

			{email && (
				<button
					onClick={() => copy(email)}
					aria-label={t('candidate.copyEmail')}
					title={t('candidate.copyEmail')}
					className='inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-text'
				>
					{copied === email ? <Check size={12} className='text-lime-fg' /> : <Copy size={12} />}
				</button>
			)}
		</div>
	)
}
