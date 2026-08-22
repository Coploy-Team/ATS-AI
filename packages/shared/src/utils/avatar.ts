/** Gera URL de avatar via DiceBear (initiais). Usar no cadastro quando o usuário não tem foto. */
export function getDiceBearAvatarUrl(seed: string): string {
	const s = encodeURIComponent(seed?.trim() || 'user')
	return `https://api.dicebear.com/7.x/initials/svg?seed=${s}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&textColor=ffffff&fontSize=40`
}
