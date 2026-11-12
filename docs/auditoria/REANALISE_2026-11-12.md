# Reanálise de integridade — 12/11/2026

Base: `main` em `7006006`, mais as correções do branch `claude/jolly-heisenberg-s9ob7a`. Análise
**somente leitura**: nenhum código, RPC, migration ou dado foi alterado. Foram lidos o código
TypeScript (764 arquivos), as Edge Functions e as 210 migrations.

**Limite importante:** o repositório não prova o estado do banco de produção. Funções e permissões
podem ter sido alteradas direto no painel. Itens marcados **"confirmar no banco"** precisam de
uma consulta só de leitura ao banco real.

Gravidade: **Crítica** (dinheiro ou dados de outro perfil), **Alta** (registro ou cobrança
errada), **Média** (exibição ou risco condicionado), **Higiene**.

---

## Crítica

### C1. `adjust_source_balance` altera o saldo de qualquer fonte, de qualquer perfil
- **Onde:** `supabase/migrations/20261006150000_ensure_source_balance_negativation_and_admin_tools.sql:4-21`.
- **O quê:** `SECURITY DEFINER` (ignora RLS), `grant execute ... to authenticated`, corpo é só
  `update fontes set balance = balance + p_delta where id = p_source_id`. Não confere dono e não
  grava lançamento no ledger.
- **Efeito:** qualquer usuário logado que obtenha o UUID de uma fonte muda o saldo dela. O saldo
  passa a divergir do ledger sem rastro.
- **Chamadores:** `hooks/controllers/useSourceController.ts:142`,
  `services/payments/paymentWallets.ts:59`, `features/agreements/services/agreementService.legacy.ts:794`.
- **Status:** confirmado no código. Confirmar no banco: `\df+ adjust_source_balance` e grants.

### C2. Criar acordo deixa o contrato pela metade se um passo falhar: cobrança dupla
- **Onde:** `features/agreements/services/agreementService.legacy.ts:364-385` (`createAgreement`).
- **O quê:** depois de criar o acordo e as parcelas, faz 3 gravações **sem checar erro**:
  contrato para `EM_ACORDO`, parcelas originais para `RENEGOCIADO` e evento no ledger
  (`transacoes`). Não há transação.
- **Efeito:** se a 1ª ou a 2ª falhar (rede, RLS), existe um acordo ATIVO e **as parcelas originais
  continuam PENDENTE/ATRASADO**. O cliente é cobrado pelas duas e aparece como inadimplente nas
  duas.
- **Chamador:** `features/agreements/components/RenegotiationModal.tsx:437`. Esse modal também
  insere e atualiza `contratos` diretamente (linhas 422-474).
- **Status:** confirmado no código. Confirmar no banco: acordos ATIVO cujo contrato não está
  `EM_ACORDO`, ou cujas parcelas originais seguem abertas.

### C3. Reativar acordo transforma parcelas já pagas em "RENEGOCIADO"
- **Onde:** `agreementService.legacy.ts:655-657` (`activateAgreement`).
- **O quê:** `update parcelas set status='RENEGOCIADO' ... .in("status", [..., "PAID", "PAGO"])`.
  Também não checa erros nem usa transação.
- **Efeito:** parcelas quitadas perdem o status de pagas. Relatórios de recebido, rentabilidade e
  histórico ficam errados sem nenhum erro visível.
- **Chamador:** `features/agreements/hooks/useAgreementView.ts:101`.
- **Status:** confirmado no código.

### C4. Webhooks de pagamento datam o Pix noturno no dia seguinte
- **Onde:** `mp-webhook/index.ts:241`, `asaas-webhook/index.ts:210`,
  `infinitepay-webhook/index.ts:380,406`, todos com `new Date().toISOString().split("T")[0]`.
- **Efeito (após 20h em Manaus no último dia):**
  - `p_payment_date` vai como amanhã, então a parcela é baixada **com 1 dia de atraso**;
  - a oferta de pagamento "válida até hoje" é tratada como vencida. No Mercado Pago e no Asaas,
    o valor com desconto pago pelo cliente vira **pagamento parcial** em vez de quitação, ou a
    baixa é recusada com `409`.
- **Status:** confirmado no código. Mesma causa já corrigida nos acordos (`agreementDates.ts`).

## Alta

### A1. Login de equipe por PIN, sem login, sem limite de tentativas e com senha em texto puro
- **Onde:** `20260720000113_harden_legacy_public_surface.sql:146-194` (`resolve_team_login`,
  `grant ... to anon`).
- **O quê:** compara `perfis.senha_acesso = p_pin` (senha guardada em claro) e devolve a linha
  inteira do perfil. Qualquer pessoa pode tentar PINs sem limite.
- **Status:** confirmado no código.

### A2. Concessão em massa de funções `SECURITY DEFINER` para qualquer usuário logado
- **Onde:** mesma migration, bloco `DO $functions$`. Faz `GRANT EXECUTE ... TO authenticated` em
  **todas** as funções `SECURITY DEFINER` que existiam naquela data.
- **Efeito:** funções internas criadas antes de 20/07/2026 e não revogadas depois continuam
  chamáveis por qualquer usuário logado. C1 é um exemplo do padrão.
- **Status:** confirmado no código. Confirmar no banco: listar funções `prosecdef` com
  `has_function_privilege('authenticated', oid, 'execute')`.

### A3. `confirm_mutuo_pre_desembolso` sem checagem de dono
- **Onde:** `20260806033357_mutuo_pre_desembolso_lifecycle.sql`. É `SECURITY DEFINER`, liberada
  para `authenticated` e confere estado e valor, mas **não o dono do documento**.
- **Efeito:** um usuário logado pode confirmar o desembolso de um mútuo de outro perfil, se tiver
  o UUID do documento.
- **Status:** confirmado no código.

### A4. Flux conta parcelas pagas ou substituídas como abertas e atrasadas
- **Onde:** `supabase/functions/ai-assistant/index.ts:231-241`.
- **O quê:** ignora só `status === 'PAID'`. Parcelas `PAGO`, `RENEGOCIADO` e `QUITADO` entram em
  "a receber". Se a data já passou, entram em "atrasadas" **mesmo com saldo zero**. A multa
  (`late_fee_accrued`) é ignorada, ao contrário dos webhooks. "Contratos ativos" exclui só
  `PAID`. O "hoje" do Flux é UTC.
- **Efeito:** o diagnóstico do Flux superestima inadimplência e erra o total a receber, com aparência
  de dado correto.
- **Status:** confirmado no código.

### A5. Asaas: webhook aceita chamada sem token se o segredo sumir, e baixa o valor da cobrança, não o valor pago
- **Onde:** `asaas-webhook/index.ts:137` (`if (ASAAS_WEBHOOK_TOKEN)`, falha aberta) e `:209`
  (`debtAmount = charge.metadata.debt_amount`, sem comparar com `payment.value`). Mercado Pago e
  InfinitePay reconsultam o pagamento na API do provedor; o Asaas não.
- **Status:** confirmado no código. Hoje o segredo existe no projeto.

### A6. Mudar cronograma do acordo não é atômico
- **Onde:** `agreementService.legacy.ts:671-734`. Atualiza parcela por parcela num laço. Se
  falhar no meio, metade do cronograma fica com datas novas e metade com antigas.
- **Status:** confirmado no código.

## Média

| # | Achado | Onde | Status |
|---|---|---|---|
| M1 | "Dias de atraso" depende do fuso do aparelho ou servidor | `utils/dateHelpers.ts:173` (base de todas as modalidades) | Confirmado por teste |
| M2 | Duas funções `getDaysDiff` diferentes (`round` × `ceil`; uma sem data de referência) | `utils/dateHelpers.ts`, `services/financialLogic.ts` | Confirmado no código |
| M3 | Duas árvores de regras por modalidade | `domain/finance/modality/` × `domain/finance/modalities/` | Confirmado no código |
| M4 | Oferta de pagamento expira às 20h no app e no portal | `riskAnalysis.ts:24`, `loanFilterResolver.ts:17`, `portalDebtRules.ts:62`, `InstallmentGrid.tsx:172` | Confirmado no código |
| M5 | Cobrança automática usa data de referência UTC | `capitalflow-n8n-tools/index.ts:618` | Hipótese (depende do horário) |
| M6 | Deduplicação de notificações vira à meia-noite UTC (20h): alerta repetido no mesmo dia | `hooks/useAppNotifications.ts:137` | Confirmado no código |
| M7 | Novo acordo sugere 1º vencimento em UTC | `RenegotiationModal.tsx:127` | Confirmado no código |
| M8 | 44 migrations usam `current_date` (fuso da sessão do banco) | ex.: status `ATRASADO` em `20260916013905…:616` | Confirmar `show timezone` |
| M9 | Tabelas centrais (`contratos`, `parcelas`, `transacoes`, `fontes`, `clientes`) não têm RLS nem políticas declaradas nas migrations | `supabase/migrations` | Confirmar no banco (podem ter sido criadas antes das migrations) |
| M10 | Funções `SECURITY DEFINER` sem `search_path` fixo | `portal_get_signals`, `portal_registrar_intencao`, `withdraw_profit_caixa_livre` e outras 3 | Confirmado no código |

## Higiene

- **Status em dois idiomas:** `PAID`/`PAGO`, `PENDING`/`PENDENTE`, `LATE`/`ATRASADO`. Toda regra
  precisa listar as duas grafias, e esquecer uma é a causa de A4. Falta uma função canônica
  `isInstallmentSettled()` usada por todos.
- **Exclusão em massa feita pelo app:** `useProfileController.ts:125-135` e `ledgerActions.ts:94-98`
  apagam `transacoes`, `parcelas`, `contratos` e `fontes` com vários comandos soltos.
- **Teste fora do gate:** 3 testes de `tests/wallet/*` falham também na `main` e esse conjunto não
  está no `test:quality` (tarefa sugerida à parte).
- **Logs de auditoria inseridos pelo app** (`core/audit/audit.service.ts:14`) podem ser
  forjados ou omitidos pelo próprio cliente.

## O que **não** foi coberto nesta passada

Cálculo de juros e multa por modalidade, linha a linha; ciclo de fatura e limite de cartão da
Carteira; geração de PDF/hash e trilha de assinatura jurídica, além do que está em A3; diferenças
entre web e APK. Ficam para a próxima etapa.

## Ordem sugerida de correção (cada item precisa de aprovação)

1. **C1** e **A3**: adicionar checagem de dono nas duas RPCs. Exige migration.
2. **C4**: data de pagamento dos webhooks no dia de Manaus. Só Edge Functions, sem migration.
3. **C2**, **C3** e **A6**: mover criar, ativar e reagendar acordo para RPCs atômicas. Exige
   migration. Paliativo imediato sem migration: checar erros, parar no primeiro, e tirar
   `PAID`/`PAGO` do congelamento do C3.
4. **A1** e **A2**: hash do PIN, limite de tentativas e revisão dos grants. Exige migration.
5. **A4**: Flux usar o mesmo critério canônico de parcela quitada e o dia de Manaus.
6. Os itens de data restantes (M1, M4–M7), seguindo o padrão já aplicado.
