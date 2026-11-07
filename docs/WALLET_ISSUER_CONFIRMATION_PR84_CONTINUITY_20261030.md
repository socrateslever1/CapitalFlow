# CapitalFlow — PR #84 integrado / correção de confirmação de faturas (30/10/2026)

## Situação comprovada
- PR #84 foi MESCLADO em main no commit `711bcefc71d4a6a45db88d3a469a1d9c2ac5d402` antes da criação da branch de correção. Sua consolidação de PRs #79/#80/#81 está preservada; não reconcilie novamente as mesmas migrations.
- Para o cartão Mercado Pago, o PDF foi identificado e seus fatos persistiram em `personal_wallet_card_invoice_facts` em 2026-11: fatura 410,55; mínimo 50,00; limite 2.800,00; utilizado 1.653,02; disponível 1.146,98; futuro 1.242,47; vencimento 04/11/2026.
- A posição de `personal_wallet_cards` permanecia em utilizado 0,00; fatura 0,00. Nenhuma compra financeira ativa. Uma linha de documento importado estava sem `expense_id`; é um documento de conferência, NÃO um gasto postado.
- Causa: saveCardInvoiceFacts fazia apenas `upsert` de fatos bancários; `WalletCardsPage` apresentava posição financeira por `getEffectiveInvoiceCycles`, ignorando fatos cujo mês não aparecia na lista de obrigações.

## Correção
- Uma nova RPC transacional `personal_wallet_confirm_issuer_invoice` salva a fotografia bancária e, apenas se o cartão não tiver pagamentos/compras/posição anterior, registra a abertura via `personal_wallet_set_card_opening_summary`, reutilizando ledger, idempotência e isolamento existentes.
- O banco valida identidade, datas do ciclo, precisão monetária e reconciliação de fatura + parcelas futuras = limite usado. Se os valores não fecharem ou houver histórico, salva somente os fatos e informa explicitamente que **não** alterou a posição financeira.
- Os ciclos com fatos bancários aparecem na navegação sem somá-los como compras; o estado financeiro é sempre distinto do valor declarado pelo emissor. Depois de salvar, recarrega os dois conjuntos de dados.
- Mostra claramente o resultado `financial_applied` verdadeiro/falso. A tela oferece **Aplicar valores já salvos à posição do cartão**, com identidade de requisição estável para tentativa repetida, sem obrigar a reenviar o PDF.
- O banco nunca gera uma nova compra por cada linha do PDF automaticamente, nem duplica resumo e parcelas; importações individuais continuam por fluxo de reconciliação.

## Evidência transacional
- Migração criada e validada com `BEGIN; CREATE OR REPLACE FUNCTION ...; ROLLBACK;`.
- Teste integrado em transação com autenticação simulada de homologação e ROLLBACK sobre fotografia do Mercado Pago: posição temporária utilizada R$ 1.653,02; fatura R$ 410,55; futuros R$ 1.242,47; apenas 1 lançamento ativo. A transação foi revertida, preservando dados reais.
- Antes do deploy verificar CI de tipagem/build/regressão, migrar banco ANTES do frontend, validar que usuário poderá aplicar os fatos já salvos sem nova importação e que o histórico Bradesco corrigido no PR #84 não será alterado.
- PR #59 (Carteira–Capital) permanece fora.
