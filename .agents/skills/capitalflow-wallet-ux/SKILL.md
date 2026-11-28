---
name: capitalflow-wallet-ux
description: Melhora a interface Minha Carteira do CapitalFlow sem regressões financeiras, preservando UX bancária e identidade CF.
---

# Carteira bancária sem regressões

1. Ler `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs/CARTEIRA_CONTINUIDADE.md` e, para trabalho de ciclo/fatura, `docs/PLANO_CARTEIRA_PARIDADE.md`.
2. Conferir os componentes `WalletOverviewSummary`, `AccountCardStack`, `BankStack`, `WalletSpendingGuide`, `WalletCardsPage`, `WalletOverviewPage`, `AccountDetailsPage` e o domínio canônico (`components/wallet/invoiceStatementDomain.ts`, `features/wallet/domain/*`). Não duplicar cálculos financeiros.
3. Respeitar o padrão visual existente: azul/verde CF, fundo escuro, botões acessíveis, cartões de crédito como superfícies físicas (proporção real 1,586:1) e contas como instituições com saldo; sem sobreposição entre limites e saldos.
4. Priorizar mobile (320–430px), tablet (768–1024px), desktop. No computador com mouse (≥1024px e ponteiro fino) os cartões ficam lado a lado; no celular, pilha com deslizar. Proteger safe-area, conteúdos longos, zoom, loading, empty e erro.
5. **Regras de fatura (invariantes):** a compra vai para a fatura da **data da compra**; o fechamento é **exclusivo** (compra no dia do fechamento entra na fatura seguinte); fatura fechada só recebe compra enquanto não venceu e não tem pagamento; a fatura é nomeada pelo **mês de vencimento**; o backend (`private.wallet_card_first_due_date`) e o espelho TS (`resolvePurchaseInvoiceMonth`) precisam dar o mesmo resultado nos mesmos casos de teste.
6. **Limite:** nunca confundir saldo de conta com limite. "Limite disponível" só para valor de origem bancária; valor calculado é "Limite estimado". O disponível parte da referência do banco e soma apenas compras criadas depois dela com data posterior ao dia da referência.
7. **Gastos por categoria:** no cartão, as parcelas do ciclo selecionado, sem créditos/estornos e sem saldo consolidado de abertura; nas contas e na Visão geral, também as operações `EXPENSE` não anuladas, sem transferências e pagamentos de fatura. São valores de consumo, não pagamentos nem previsão de caixa. Percentuais inteiros somam 100 (maior resto).
8. Fluxos financeiros apenas por serviços/RPCs existentes, e operações com várias escritas apenas por RPC atômica (ver `capitalflow-execution-safety`). Interface de aconselhamento não grava, paga, altera nem remove.
9. Testes: `npm run test:wallet-visual-next`, `npm run test:wallet-overview`, `npm run test:wallet-pages`, `npm run test:wallet-invoice-cycle`, `npm run test:quality`. Validar o código e, quando possível, o render no navegador; não confundir as duas coisas.
10. Após a entrega, atualizar `docs/CARTEIRA_CONTINUIDADE.md` com decisões, riscos e evidências. Não alegar produção APK sem verificar o GitHub Actions e release.

## Exclusão de lançamento errado

- "Excluir" compra do cartão, parcela ou movimentação manual da conta **apaga do banco** (RPCs `personal_wallet_delete_wrong_expense`, `personal_wallet_delete_wrong_operation`, `personal_wallet_cancel_installments`), sem deixar registro cancelado.
- Pago, vinculado a empréstimo/conta a pagar/receita fixa/capital/pendente efetivado ou pagamento de fatura: não apaga; usa o estorno próprio (reabrir fatura, estorno do contrato).
- Não criar novo fluxo de exclusão que só marque `CANCELED`.
