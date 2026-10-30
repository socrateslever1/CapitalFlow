---
name: capitalflow-wallet-ux
description: Melhora a interface Minha Carteira do CapitalFlow sem regressões financeiras, preservando UX bancária e identidade CF.
---

# Carteira bancária sem regressões

1. Ler `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs/CARTEIRA_CONTINUIDADE.md`.
2. Conferir os componentes `WalletOverviewSummary`, `AccountCardStack`, `WalletSpendingGuide`, `WalletCardsPage`, `WalletOverviewPage` e o domínio canônico. Não duplicar cálculos financeiros.
3. Respeitar o padrão visual existente: azul/verde CF, fundo escuro, botões acessíveis, cartões de crédito como superfícies físicas e contas como instituições com saldo; sem sobreposição entre limites e saldos.
4. Priorizar mobile (320–430px), tablet (768–1024px), desktop. Proteger safe-area, conteúdos longos, zoom, loading, empty e erro.
5. Gastos por categoria: somente `personal_wallet_expenses` carregadas, excluindo overrides, abertura e cancelamentos; são valores originais no mês da compra, não pagamentos ou previsão de caixa. Nunca somar como passivos sem regra canônica.
6. Fluxos financeiros apenas por serviços/RPCs existentes. Interface de aconselhamento não grava, paga, altera nem remove.
7. Testes: `npm run test:wallet-visual-next`, `npm run test:wallet-overview`, `npm run test:wallet-pages`, `npm run test:quality`. Validar o código e, quando possível, o render no navegador; não confundir as duas coisas.
8. Após a entrega, atualizar `docs/CARTEIRA_CONTINUIDADE.md` com decisões, riscos e evidências. Não alegar produção APK sem verificar o GitHub Actions e release.
