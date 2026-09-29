# Payment Engine do CapitalFlow

## Princípio

O backend financeiro é a fonte da verdade. A interface, IA, automação e futuras Skills apenas solicitam operações tipadas; PostgreSQL valida, calcula, bloqueia concorrência, persiste e audita.

## Fluxo V4

```text
Operador / futura Skill
        ↓
preview_financial_operation_v4
        ↓
confirmação humana
        ↓
process_financial_operation_v4
        ↓
locks + autorização + idempotência
        ↓
parcela + carteiras + contrato + ledger + payment_transactions
        ↓
financial_operations (snapshot e resultado)
```

A execução chama a mesma função de prévia. Não existe cálculo financeiro equivalente no frontend nem fallback de escrita direta.

## Garantias

- **Atomicidade:** todas as mutações V4 ocorrem na mesma transação PostgreSQL.
- **Idempotência:** chave UUID única por perfil, com replay do resultado já persistido.
- **Concorrência:** advisory lock e `FOR UPDATE` em contrato, parcela e carteiras.
- **Prévia vinculante:** a execução recebe a prévia confirmada e aborta se qualquer componente mudou.
- **Autorização:** o perfil financeiro é obtido do contrato; o cliente não escolhe o tenant.
- **Auditoria:** `financial_operations`, `payment_transactions`, `transacoes` e log da parcela.
- **Estorno:** restaura o snapshot anterior e bloqueia quando existem operações posteriores.
- **Fail-closed:** sem backend ou internet, recebimento, aporte e estorno não são executados.

## Componentes financeiros

O valor recebido é separado em principal, juros e atraso pelo backend autoritativo. Principal recuperado retorna à fonte de capital. Juros e atraso realizados vão ao Caixa Livre identificado no mesmo perfil ou, por compatibilidade, ao saldo de juros do perfil. O Capital na Rua é reduzido apenas pela baixa autoritativa do principal na parcela; nenhum valor perdoado entra em carteira.

## Operações

- `KEEP_PENDING`: recebe e mantém exatamente o vencimento e saldo remanescentes.
- `RENEW_KEEP_PENDING`: escolha explícita; mantém o saldo e avança o vencimento em 30 dias, quando a modalidade permite.
- `CAPITALIZE`: transforma juros/atraso remanescentes em principal e registra evento de capitalização.
- `SETTLE`: distingue valor recebido de valor perdoado e zera a obrigação selecionada com auditoria.
- `REVERSAL`: desfaz a operação V4 usando o snapshot, com vínculo ao evento original.

## Meios de pagamento

`PIX`, `CASH`, `BANK_TRANSFER`, `CREDIT_CARD`, `BOLETO` e `OTHER`. Nomes legados conhecidos são normalizados no backend; valores desconhecidos são recusados.

## Compatibilidade

Condições especiais, pagamentos de acordos e novos aportes continuam usando suas RPCs atômicas existentes. O acesso autenticado às versões antigas de `process_payment_v3_selective` é removido; integrações internas com `service_role` permanecem disponíveis para Edge Functions já existentes.

## Estornos fora do V4

- Pagamento V4: `reverse_financial_operation_v4`.
- Pagamento legado: `reverse_payment_group`.
- Acordo: `reverse_agreement_payment_atomic`.
- Aporte e novo empréstimo V4: `process_lend_more_atomic` e `reverse_capital_advance_v4`; registros legados sem chave continuam bloqueados.

## Skills financeiras

Não há diretório `ai/skills` neste checkout. Skills de escrita financeira permanecem **BLOCKED** até as migrations V4 serem aplicadas em ambiente controlado, os testes de banco passarem e a reconciliação de carteiras ser validada. Nenhuma Skill deve receber `service_role`, executar SQL, escolher perfil ou calcular valores.

## Implantação segura

1. Aplicar a migration primeiro em branch/staging Supabase.
2. Executar lint e testes de banco, incluindo concorrência e repetição da mesma chave.
3. Comparar prévia e execução para todas as modalidades.
4. Reconciliar principal, Caixa Livre, Capital na Rua e ledger.
5. Somente então promover para produção e liberar Skills financeiras.

Registros legados possivelmente duplicados ou acordos antigos sem auditoria não são corrigidos por esta implementação.

## Riscos existentes não alterados

- Produção ainda expõe `process_payment_v3_selective` a `authenticated`; a migration V4 revoga esse acesso, mas ainda não foi aplicada.
- O advisor do Supabase aponta funções `SECURITY DEFINER` executáveis por `anon`; endpoints públicos do portal precisam ser classificados individualmente antes de qualquer revogação.
- Há tabelas com RLS sem policy, políticas permissivas duplicadas e índices duplicados. Alguns casos podem ser intencionais para acesso exclusivo por RPC/service role; exigem auditoria separada.
- O build mantém avisos preexistentes de chunks grandes e imports simultaneamente estáticos/dinâmicos.
