# Carteira — edição de vencimento e cancelamento de fatura — 30/10/2026

## Problemas e causa
- `getInvoiceCycleDates` interpretava mês de vencimento da fatura como mês de fechamento, deslocando o vencimento um mês quando o dia de vencimento era anterior ao dia de fechamento.
- `ExpenseEditModal` ocultava o mês de fatura quando recebia `compact=true`; agora há edição do mês do ciclo e dos demais campos.
- `WalletCardsPage` ignorava a data bancária exata existente em `personal_wallet_card_invoice_facts.due_date` ao mostrar vencimento e estado da fatura.
- A RPC `personal_wallet_update_expense_idempotent` não permitia qualquer edição se `used_limit>credit_limit`, mesmo sem aumento da dívida.

## Entregas
- O mês do ciclo (`YYYY-MM-01`) continua chave interna; a data bancária (dia, mês e ano) é apresentada separadamente, corrigível em **Corrigir vencimento e valores**. O dia habitual é editado no cadastro do cartão.
- Edição de compra pendente: valor, descrição, data, categoria, mês da fatura e observações. Compras que receberam pagamento não podem ter histórico financeiro reescrito.
- Cancelamento **lógico** de valor consolidado **não pago** pela nova RPC idempotente `personal_wallet_cancel_invoice_consolidation`: mantém compras individuais, extratos e histórico de auditoria. Não é exclusão global de todas as compras e não registra estornos.
- Edição da compra quando o cartão já está excedido: pode manter ou reduzir a dívida, sem aumentar o excesso. Nenhum bypass financeiro genérico.
- Nenhum pagamento/capital/estorno/ledger foi modificado.

## Integração segura
- PR #78: atualização APK e modal de condições; modifica `package.json` e `components/ui/Modal.tsx`.
- PR #79: correção do cadastro inicial, inclusive limite excedido. Modifica `package.json` e documentação geral.
- PR de edição de faturas: não modifica `package.json` nem `components/ui/Modal.tsx`; é isolado do PR #78 e das alterações de Capital no PR #59.
- Ordem preferencial de publicação: validar e mesclar PR #79 com migração correspondente; rebase do PR de faturas após merge; aplicar migração do PR de faturas **antes** de implantar o frontend; revalidar o PR #78.
- Validação necessária: CI/build, testes de fatura paga e não paga, pagamento parcial, compras importadas, fatura com várias parcelas, data exata do banco e comportamento Android físico.
- Não mudar dados do usuário para ajustar a interface; todas as correções devem ser auditáveis.

## Exclusão de fatura não paga (adicional)
- `personal_wallet_cancel_unpaid_invoice_cycle` cancela **todos os lançamentos pendentes** pertencentes exclusivamente ao ciclo selecionado, com `invoice_cancel_requests` no cartão como rastreabilidade/idempotência.
- Bloqueia se existir qualquer pagamento, item já pago, operação não suportada ou compra parcelada com parcelas de outros meses. Essas últimas podem ser canceladas individualmente pelo fluxo canônico de compras, após conferência.
- A exclusão é lógica: mantém histórico e documentos importados. Não apaga registros de pagamento, não gera estornos e não altera a conta bancária.
- Diferenciar opções: **Cancelar consolidação** remove só o resumo substitutivo, preservando compras; **Excluir fatura não paga** cancela os itens financeiros elegíveis daquele mês.
