# Redesign de produção da Carteira CapitalFlow

## Intenção
Recriar a carteira móvel com o padrão de interação observado no Mercado Pago: uma pilha física e compacta de cartões de crédito, que abre um bottom sheet detalhado. A tela deve distinguir claramente dinheiro disponível, crédito e passivos, sem sanfonas ou listas redundantes.

## Objetivos
- Uma única pilha sobreposta de cartões, compacta e clicável.
- Bottom sheet com progresso consolidado e cartões por emissor.
- Normalização forte de instituições para não separar “Nu” e “Nubank”.
- Contas híbridas e cartões standalone, mantendo dados legados.
- Passivos PF/PJ com saldo restante, pagamento parcial, encargos, comprovante e impacto no fluxo de caixa.
- Cobrança PIX com valor, descrição e conta; titular e cidade automáticos; QR vetorial e link amigável.
- Supabase com constraints, RLS, índices, grants e operação atômica de pagamento.

## Não objetivos
- Confirmar liquidação bancária de PIX estático.
- Criar cartão, saldo ou limite real em uma instituição financeira.
- Armazenar PAN/CVV adicionalmente nesta refatoração.

## Abordagens consideradas
1. Entidade financeira única para conta e cartão. Rejeitada: mistura saldo e crédito e exigiria migração destrutiva.
2. Manter contas/cartões e adicionar vínculo opcional, com visão agregada no frontend. Escolhida: compatível, auditável e representa híbridos/standalone.
3. Agrupar apenas por texto na interface. Rejeitada: perpetua duplicidades como “Nu” e “Nubank”.

## Arquitetura escolhida
- `walletPresentation.ts`: catálogo visual, aliases, agrupamento e agregados puros.
- `WalletCardStack.tsx`: pilha compacta sem expansão inline.
- `WalletCardsSheet.tsx`: drawer acessível e responsivo com cartões detalhados.
- `WalletPayablesPanel.tsx`: painel e ações de passivos.
- `WalletChargeGenerator.tsx`: formulário e apresentação; `pixPayload.ts`: BR Code/CRC16 testável.
- `personalWallet.service.ts`: acesso tipado ao Supabase e RPC de pagamento parcial.

## Dados e segurança
- Evoluir `personal_wallet_payables` com documento, total, saldo, encargos, comprovante e status derivável.
- Criar histórico `personal_wallet_payable_payments`.
- Storage em bucket privado para comprovantes, com políticas baseadas em pasta do usuário.
- RPC `personal_wallet_pay_payable` atômica, idempotente por `request_id`.
- RLS por `owner_user_id = auth.uid()` e grants explícitos a `authenticated`.

## UX
- A pilha mostra apenas o necessário; cartões traseiros aparecem por uma faixa colorida.
- Tocar em qualquer região abre o drawer. Escape, backdrop e botão fecham.
- O drawer ocupa até 92dvh no celular, com handle, cabeçalho fixo e rolagem interna.
- O painel de passivos exibe passivo total, vencido e impacto de 30 dias.
- Cobrança usa a conta selecionada e nunca pede nome/cidade manualmente.
