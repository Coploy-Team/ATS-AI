import { Check, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

import { Field } from '@/features/job-form/fields'

/** A mesma régua que o servidor aplica — dita antes, não depois de errar. */
const MIN_LENGTH = 8

function fraqueza(senha: string): string | null {
	if (senha.length < MIN_LENGTH) return 'minLength'
	if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha)) return 'case'
	if (!/\d/.test(senha)) return 'digit'
	return null
}

/**
 * Trocar a senha sem sair do produto.
 *
 * Antes disso a única saída era "esqueci a senha": a pessoa recebia um e-mail
 * para resolver, estando logada, algo que já podia fazer ali. Pedir a senha
 * atual não é burocracia — é o que separa "quero trocar minha senha" de
 * "alguém pegou este notebook destravado".
 *
 * As regras aparecem SEMPRE, não só depois do erro: descobrir a política de
 * senha uma exigência por vez é a forma mais lenta de escolher uma senha.
 */
export function PasswordCard() {
	const { t } = useTranslation()
	const trocar = empresa.usePostAuthChangePassword()

	const [atual, setAtual] = useState('')
	const [nova, setNova] = useState('')
	const [confirmacao, setConfirmacao] = useState('')
	const [pronto, setPronto] = useState(false)
	const [erro, setErro] = useState<string | null>(null)

	const problema = nova ? fraqueza(nova) : null
	const naoConfere = confirmacao.length > 0 && nova !== confirmacao
	const podeSalvar =
		atual.length > 0 && nova.length > 0 && !problema && !naoConfere && confirmacao.length > 0

	async function salvar() {
		setErro(null)
		setPronto(false)
		try {
			await trocar.mutateAsync({ data: { currentPassword: atual, newPassword: nova } })
			setAtual('')
			setNova('')
			setConfirmacao('')
			setPronto(true)
		} catch (falha) {
			/*
			 * A mensagem do servidor é específica ("Senha atual incorreta") e é ela
			 * que ajuda; trocar por um genérico esconderia a única informação útil.
			 */
			const detalhe = (falha as { data?: { message?: string } })?.data?.message
			setErro(detalhe || t('password.failed'))
		}
	}

	return (
		<Card title={t('password.title')} description={t('password.hint')}>
			<div className='flex max-w-[440px] flex-col gap-3'>
				<Field label={t('password.current')}>
					<input
						type='password'
						autoComplete='current-password'
						value={atual}
						onChange={(event) => setAtual(event.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
					/>
				</Field>

				<Field label={t('password.new')} hint={t('password.rules', { min: MIN_LENGTH })}>
					<input
						type='password'
						autoComplete='new-password'
						value={nova}
						onChange={(event) => setNova(event.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
					/>
				</Field>
				{problema && <p className='-mt-1 text-[11.5px] text-amber'>{t(`password.${problema}`)}</p>}

				<Field label={t('password.confirm')}>
					<input
						type='password'
						autoComplete='new-password'
						value={confirmacao}
						onChange={(event) => setConfirmacao(event.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
					/>
				</Field>
				{naoConfere && <p className='-mt-1 text-[11.5px] text-amber'>{t('password.mismatch')}</p>}

				{erro && <p className='text-[12px] text-danger'>{erro}</p>}
				{pronto && (
					<p className='inline-flex items-center gap-1.5 text-[12px] text-lime-fg'>
						<Check size={13} /> {t('password.changed')}
					</p>
				)}

				<div>
					<Button onClick={() => void salvar()} disabled={!podeSalvar || trocar.isPending}>
						<KeyRound size={13} />
						{trocar.isPending ? t('password.saving') : t('password.submit')}
					</Button>
				</div>
			</div>
		</Card>
	)
}
