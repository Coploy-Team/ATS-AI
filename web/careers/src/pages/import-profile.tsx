import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { completeProfileImport } from '@/lib/ots-profile-import'

/**
 * Callback do import de perfil OTS — a página onde o OAuth do provedor de
 * origem devolve o candidato. Troca o code, busca o Profile, grava no perfil
 * local e volta pra onde a pessoa estava, com o resultado na query string.
 *
 * Sem UI de decisão: quem chega aqui já decidiu tudo lá atrás. A tela só
 * existe pros dois segundos de troca — e pro caso de erro não engolir a
 * pessoa num beco sem saída.
 */
export function ImportProfilePage() {
	const { t } = useTranslation()
	const [failed, setFailed] = useState(false)
	// StrictMode monta duas vezes e o code do OAuth é de USO ÚNICO — o guard
	// impede a segunda montagem de queimar a troca que a primeira começou.
	const started = useRef(false)

	useEffect(() => {
		if (started.current) return
		started.current = true
		const params = new URLSearchParams(window.location.search)
		const code = params.get('code')
		const state = params.get('state')
		if (!code || !state) {
			setFailed(true)
			return
		}
		completeProfileImport(code, state)
			.then((outcome) => {
				const target = new URL(outcome.returnTo, window.location.origin)
				target.searchParams.set('perfil', outcome.imported ? 'importado' : 'vazio')
				window.location.replace(target.toString())
			})
			.catch(() => setFailed(true))
	}, [])

	return (
		<div className='flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center'>
			{failed ? (
				<>
					<p className='text-[14px] font-medium'>{t('profileImport.failedTitle')}</p>
					<p className='max-w-md text-[12.5px] leading-relaxed text-text-2'>
						{t('profileImport.failedBody')}
					</p>
					<button
						onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}
						className='text-[13px] font-medium text-lime-fg hover:underline'
					>
						{t('profileImport.goBack')}
					</button>
				</>
			) : (
				<>
					<Loader2 size={20} className='animate-spin text-text-2' />
					<p className='text-[13px] text-text-2'>{t('profileImport.working')}</p>
				</>
			)}
		</div>
	)
}
