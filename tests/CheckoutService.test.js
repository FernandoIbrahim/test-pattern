import { CheckoutService } from '../src/services/CheckoutService.js';
import { jest } from '@jest/globals';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';
import { UserMother } from './builders/UserMother.js';
import { Item } from '../src/domain/Item.js';

describe('CheckoutService', () => {
  // ========== TESTES DE VERIFICAÇÃO DE ESTADO (STUBS) ==========

  describe('quando o pagamento não é autorizado (Verificação de Estado - Stub)', () => {
    it('deve retornar null se o GatewayPagamento recusar a cobrança', async () => {
      // Arrange
      const carrinho = CarrinhoBuilder.umCarrinho().comValorTotal(100.0).build();

      // Stub: Gateway retorna falha
      const gatewayStub = {
        cobrar: jest.fn().mockResolvedValue({ success: false, error: 'Transação recusada pelo emissor' }),
      };

      // Dummies: não devem ser chamados
      const repositoryDummy = {
        salvar: jest.fn(),
      };
      const emailDummy = {
        enviarEmail: jest.fn(),
      };

      const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      const pedido = await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert - Verificação de Estado
      expect(pedido).toBeNull();
    });
  });

  describe('quando um cliente padrão conclui a compra (Verificação de Estado - Stub)', () => {
    it('deve retornar o pedido salvo com o totalFinal correto', async () => {
      // Arrange
      const userPadrao = UserMother.umUsuarioPadrao();
      const carrinho = CarrinhoBuilder.umCarrinho()
        .comUser(userPadrao)
        .comItens([new Item('Produto A', 50.0), new Item('Produto B', 50.0)])
        .build();

      const totalEsperado = 100.0; // Sem desconto para usuário padrão

      // Stub: Gateway retorna sucesso
      const gatewayStub = {
        cobrar: jest.fn().mockResolvedValue({ success: true }),
      };

      // Stub: Repository retorna pedido com ID
      const pedidoSalvoMock = {
        id: 123,
        carrinho: carrinho,
        totalFinal: totalEsperado,
        status: 'PROCESSADO',
      };
      const repositoryStub = {
        salvar: jest.fn().mockResolvedValue(pedidoSalvoMock),
      };

      // Stub: Email service (não verificamos comportamento aqui)
      const emailStub = {
        enviarEmail: jest.fn().mockResolvedValue(true),
      };

      const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      const pedido = await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert - Verificação de Estado
      expect(pedido).not.toBeNull();
      expect(pedido.id).toBe(123);
      expect(pedido.totalFinal).toBe(totalEsperado);
      expect(pedido.status).toBe('PROCESSADO');
    });
  });

  // ========== TESTES DE VERIFICAÇÃO DE COMPORTAMENTO (MOCKS) ==========

  describe('quando um cliente Premium finaliza a compra (Verificação de Comportamento - Mock)', () => {
    it('deve aplicar 10% de desconto na cobrança do GatewayPagamento', async () => {
      // Arrange
      const userPremium = UserMother.umUsuarioPremium();
      const carrinho = CarrinhoBuilder.umCarrinho().comUser(userPremium).comValorTotal(200.0).build();

      const totalInicial = 200.0;
      const totalComDesconto = totalInicial * 0.9; // 180.00

      // Mock: Gateway - verificar chamada com valor correto
      const gatewayMock = {
        cobrar: jest.fn().mockResolvedValue({ success: true }),
      };

      // Stub: Repository retorna pedido salvo
      const pedidoSalvoMock = {
        id: 456,
        carrinho: carrinho,
        totalFinal: totalComDesconto,
        status: 'PROCESSADO',
      };
      const repositoryStub = {
        salvar: jest.fn().mockResolvedValue(pedidoSalvoMock),
      };

      // Stub: Email service
      const emailStub = {
        enviarEmail: jest.fn().mockResolvedValue(true),
      };

      const checkoutService = new CheckoutService(gatewayMock, repositoryStub, emailStub);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert - Verificação de Comportamento
      expect(gatewayMock.cobrar).toHaveBeenCalledTimes(1);
      expect(gatewayMock.cobrar).toHaveBeenCalledWith(totalComDesconto, cartaoCredito);
    });
  });

  describe('quando o pagamento é aprovado (Verificação de Comportamento - Mock)', () => {
    it('deve acionar o EmailService com as informações corretas', async () => {
      // Arrange
      const emailCliente = 'cliente@teste.com';
      const user = UserMother.umUsuarioComEmail(emailCliente);
      const carrinho = CarrinhoBuilder.umCarrinho().comUser(user).comValorTotal(150.0).build();

      // Stub: Gateway retorna sucesso
      const gatewayStub = {
        cobrar: jest.fn().mockResolvedValue({ success: true }),
      };

      // Stub: Repository retorna pedido com ID
      const pedidoSalvoMock = {
        id: 789,
        carrinho: carrinho,
        totalFinal: 150.0,
        status: 'PROCESSADO',
      };
      const repositoryStub = {
        salvar: jest.fn().mockResolvedValue(pedidoSalvoMock),
      };

      // Mock: Email - verificar conteúdo do envio
      const emailMock = {
        enviarEmail: jest.fn().mockResolvedValue(true),
      };

      const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert - Verificação de Comportamento
      expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.enviarEmail).toHaveBeenCalledWith(
        emailCliente,
        'Pagamento confirmado!',
        expect.stringContaining('789')
      );
      expect(emailMock.enviarEmail).toHaveBeenCalledWith(
        emailCliente,
        'Pagamento confirmado!',
        expect.stringContaining('150')
      );
    });
  });

  describe('quando o pagamento é recusado (Verificação de Comportamento - Mock)', () => {
    it('não deve persistir pedido nem enviar notificação', async () => {
      // Arrange
      const carrinho = CarrinhoBuilder.umCarrinho().comValorTotal(100.0).build();

      // Stub: Gateway retorna falha
      const gatewayStub = {
        cobrar: jest.fn().mockResolvedValue({ success: false, error: 'Fundos insuficientes' }),
      };

      // Mocks: devem permanecer não chamados
      const repositoryMock = {
        salvar: jest.fn(),
      };
      const emailMock = {
        enviarEmail: jest.fn(),
      };

      const checkoutService = new CheckoutService(gatewayStub, repositoryMock, emailMock);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert - Verificação de Comportamento
      expect(repositoryMock.salvar).not.toHaveBeenCalled();
      expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });
  });

  // ========== TESTE ADICIONAL: CENÁRIO COMPLETO PREMIUM ==========

  describe('fluxo completo: cliente Premium com pagamento aprovado', () => {
    it('deve aplicar desconto, registrar o pedido e enviar confirmação', async () => {
      // Arrange
      const emailPremium = 'premium@email.com';
      const userPremium = UserMother.umUsuarioPremiumComEmail(emailPremium);
      const carrinho = CarrinhoBuilder.umCarrinho()
        .comUser(userPremium)
        .comItens([new Item('Notebook', 3000.0), new Item('Mouse', 100.0)])
        .build();

      const totalInicial = 3100.0;
      const totalComDesconto = totalInicial * 0.9; // 2790.00

      // Mocks e Stubs
      const gatewayMock = {
        cobrar: jest.fn().mockResolvedValue({ success: true }),
      };

      const pedidoSalvoMock = {
        id: 999,
        carrinho: carrinho,
        totalFinal: totalComDesconto,
        status: 'PROCESSADO',
      };
      const repositoryMock = {
        salvar: jest.fn().mockResolvedValue(pedidoSalvoMock),
      };

      const emailMock = {
        enviarEmail: jest.fn().mockResolvedValue(true),
      };

      const checkoutService = new CheckoutService(gatewayMock, repositoryMock, emailMock);
      const cartaoCredito = '1234-5678-9012-3456';

      // Act
      const pedido = await checkoutService.processarPedido(carrinho, cartaoCredito);

      // Assert
      // 1. Estado: pedido retornado corretamente
      expect(pedido).not.toBeNull();
      expect(pedido.id).toBe(999);
      expect(pedido.totalFinal).toBe(totalComDesconto);

      // 2. Comportamento: desconto aplicado na cobrança
      expect(gatewayMock.cobrar).toHaveBeenCalledWith(totalComDesconto, cartaoCredito);

      // 3. Comportamento: pedido foi salvo
      expect(repositoryMock.salvar).toHaveBeenCalledTimes(1);

      // 4. Comportamento: email foi enviado com confirmação
      expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.enviarEmail).toHaveBeenCalledWith(
        emailPremium,
        'Pagamento confirmado!',
        expect.stringContaining('999')
      );
    });
  });
});