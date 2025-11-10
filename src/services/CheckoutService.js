import { Pedido } from '../domain/Pedido.js';

export class CheckoutService {
    
    // Injeção de Dependência via construtor
    constructor(gateway, repository, emailSvc) {
        this.gatewayPagamento = gateway;
        this.pedidoRepository = repository;
        this.emailService = emailSvc;
    }

    async processarPedido(carrinho, cartaoCredito) {
        const totalInicial = carrinho.calcularTotal();
        let totalFinal = totalInicial;

        // 1. Regra de negócio: Desconto para Premium
        if (carrinho.user.isPremium()) {
            totalFinal = totalInicial * 0.90;
        }

        // 2. Dependência Externa: Cobrança
        const respostaPgto = await this.gatewayPagamento.cobrar(totalFinal, cartaoCredito);

        if (!respostaPgto.success) {
            return null; // Falha no pagamento
        }

        // 3. Preparar pedido
        const pedido = new Pedido(null, carrinho, totalFinal, 'PROCESSADO');

        // 4. Dependência Externa: Persistência
        const pedidoSalvo = await this.pedidoRepository.salvar(pedido);

        // 5. Dependência Externa: Notificação (Efeito Colateral)
        try {
            await this.emailService.enviarEmail(
                carrinho.user.email,
                "Pagamento confirmado!",
                `Pedido ${pedidoSalvo.id} no valor de R$${totalFinal}`
            );
        } catch (e) {
            // Não deve falhar o checkout se o e-mail falhar,
            // mas deve logar (não implementado aqui)
            console.error("Falha ao enviar e-mail", e.message);
        }

        return pedidoSalvo;
    }
}