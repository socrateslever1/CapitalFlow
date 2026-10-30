# CapitalFlow — consolidação da Carteira e correção de competência/vencimento

Data: 30/10/2026 — integração das PRs #79, #80, #81 pela PR #84.

## Erro reproduzido
O Bradesco foi cadastrado com **fechamento no dia 21 e vencimento habitual no dia 3**. Portanto, o fechamento de **21/10/2026** corresponde à fatura de competência **outubro/2026**, cujo pagamento vence **03/11/2026**. A implementação antiga tratou a escolha "mês da fatura = 10/2026" como mês de vencimento (03/10) e, ao corrigir para novembro, criou uma **segunda consolidação** de R$ 2.517,55.

A investigação SQL revelou duas `INVOICE_OVERRIDE` PENDING, ambas R$ 2.517,55, em 2026-10 e 2026-11; nenhum pagamento nos dois ciclos. O cartão também tinha saldo futuro inicial R$ 5.628,28, que **não pode ser apagado**. A posição comprometida estava indevidamente elevada a R$ 10.663,38. Em simulação transacional com ROLLBACK, após reunir as consolidações sem pagamento, ficou R$ 8.145,83 (= R$ 2.517,55 + R$ 5.628,28), mantendo todos os históricos.

## Correções
- `getInvoiceCycleDates`: `dueMonth` sempre é o mês real de pagamento. Competência é derivada do fechamento e pode ser o mês anterior.
- O seletor de faturas e `Compromissos próximos` mostram **competência e vencimento** separadamente, respeitando vencimentos exatos salvos em `personal_wallet_card_invoice_facts`.
- O modal `Corrigir fatura` oferece edição de mês de pagamento, data exata e valor sem duplicar obrigações.
- Nova RPC transacional e idempotente `personal_wallet_correct_invoice_override`: corrige a consolidação original, recusa ciclos pagos, consulta destino sob locks e cancela *logicamente* uma duplicata do mesmo valor, preservando trilha de auditoria. Se o destino não corresponder, bloqueia em vez de somar outra dívida.
- Correções complementares das PRs #79 (abertura com limite excedido), #80 (edição de lançamentos e cancelamentos auditados) e #81 (combobox bancário e cofre) foram conciliadas.
- Foi corrigida uma migration SQL da PR #80 originalmente inválida (delimitadores `AS $`), que passou no teste transacional de sintaxe.
- Os dados criptografados do cartão, os pagamentos, os saldos da conta e o ledger não são alterados pela correção de vencimento.

## Validação e segurança
- Dry-run no Supabase sobre a duplicação real, com `ROLLBACK`: um único ciclo PENDING, abertura atribuída a novembro, vencimento 03/11/2026, saldo comprometido reconciliado.
- Teste adicional da mesma `request_id` retorna `replayed=true` e não duplica saldo.
- Regressões TS, domínio e testes financeiros obrigatórios por GitHub Actions antes da integração.
- Migrações #79/#80/#84 devem ser aplicadas nessa ordem e somente após validar as alterações; publicação de APK deve ser comprovadamente assinada.
- A PR #59 (Carteira–Capital) continua separada porque modifica o motor de pagamentos/ledger e depende de migrações ainda não aprovadas.

## Restrições de integridade
A correção não autoriza edição silenciosa de faturas pagas, movimentação financeira retroativa, apagamento de histórico ou alteração direta de recebimentos. Em caso de pagamento, usar fluxo próprio de ajuste/estorno auditado.

## Continuidade
Não voltar a rotular `due_month` como "competência". Em novos formulários, pedir **data exata de vencimento** ou **mês de pagamento** separadamente. Uma tentativa de mudar outubro para novembro deve **mover uma obrigação**, jamais criar outra. Ao importar PDF, diferenciar o texto impresso da competência e a data efetiva de vencimento.
