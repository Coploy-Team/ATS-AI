export class StripeError extends Error {
	constructor(message = 'Erro no processamento de pagamento') {
		super(message)
		this.name = 'StripeError'
	}
}
