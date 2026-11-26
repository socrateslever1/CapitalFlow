# Plano — Carteira: correções e paridade com o Minhas Finanças

Origem: comparação de 26/11/2026 entre a lógica do Minhas Finanças 7.3.0 (referência de comportamento, nenhum código copiado) e a do CapitalFlow. Ordem obrigatória: **Fase 0 (erros) → Fase 1 (ciclo do cartão) → Fase 2 (ferramentas)**. Uma entrega por item, cada uma reversível sozinha.

## Regras para todas as entregas

- Seguir `AGENTS.md`, `docs/AGENT_EXECUTION_CONTRACT.md` e as skills `capitalflow-execution-safety` e `capitalflow-wallet-ux`.
- Itens que mudam RPC, migration, ledger, pagamento ou estorno **só começam com autorização expressa do proprietário para aquele item**. Este plano não é essa autorização.
- Toda mudança nova de schema chega com **valor padrão que reproduz o comportamento atual**: aplicar a migration não muda nenhum resultado até o usuário usar o recurso.
- Histórico não é recalculado: `due_month` das parcelas já gravadas, pagamentos e saldos existentes não mudam por causa de uma regra nova.
- Operação com mais de uma escrita = uma única RPC transacional e idempotente (`request_id`).
- Regra de ciclo existe em dois lugares (SQL e `invoiceStatementDomain.ts`). Cada mudança de ciclo vem com **casos de teste compartilhados** (mesmas entradas e saídas) rodados contra o Postgres em memória e contra o TS.
- Gate de cada entrega: testes do domínio, `npm run test:quality`, `npm run test:wallet-visual-next`, `git diff --check`, revisão independente, `CHANGELOG.md` + `src/constants/changelog.ts` + `docs/CARTEIRA_CONTINUIDADE.md`, commit na `main`, CI verde conferido.
- Testes e docs só com dados fictícios (repositório público).

---

## Fase 0 — Corrigir erros (prioridade)

### 0.1 Saldo restante da fatura em uma única operação
- **Problema:** `handleInvoiceRemainder` (`features/wallet/pages/WalletCardsPage.tsx`) quita o restante na fatura atual e depois cria a despesa na próxima, em duas chamadas. Se a segunda falhar, o restante some das duas faturas. O mesmo vale para o modo "parcelar o restante".
- **Solução:** RPC `personal_wallet_roll_invoice_remainder(card, mês, modo, valor, parcelas, request_id)` que, numa transação, quita o restante, cria a despesa ou o parcelamento na fatura de destino e grava o vínculo entre os dois. Replay com o mesmo `request_id` devolve o mesmo resultado.
- **Aceite:** falha simulada no meio não altera nada; replay não duplica; soma da fatura atual + próxima antes = depois; categoria "Parcelamento de fatura" no modo parcelado.
- **Testes:** PGlite (nominal, replay, falha, usuário errado), teste de arquitetura proibindo `payInvoicePartial` seguido de `createExpense` no cliente.

### 0.2 Antecipação de parcelas em uma única operação
- **Problema:** `handleAdvanceInstallments` cancela a compra original e recria até três lançamentos (mantidas, antecipadas, cauda) em chamadas separadas, sem `request_id`. Falha no meio apaga parcelas; repetir duplica. Além disso, as recriações passam pelo roteamento de fatura, que pode mover uma parcela com data passada.
- **Solução:** RPC `personal_wallet_advance_installments(expense, mês_atual, quantidade, desconto, request_id)` que, numa transação, move as parcelas escolhidas para a fatura atual, registra o desconto como crédito e preserva numeração e meses das demais, **sem cancelar e recriar a compra**.
- **Aceite:** numeração original preservada (ex.: 11/18 continua 11/18); total da compra = antecipado líquido + desconto + restante; meses das parcelas não antecipadas não mudam; replay não duplica.

### 0.3 Varredura de outras operações encadeadas
- Listar, nos componentes da Carteira, todo fluxo com duas ou mais escritas financeiras seguidas (há 16 chamadas em `WalletCardsPage.tsx`, além de `QuickWalletActionsModal`, `QuickExpenseModal` e `AccountMovementModal`). Cada fluxo encontrado vira um item como 0.1, ou é registrado como seguro com justificativa.
- Somente leitura; não exige autorização.

### 0.4 Migrations locais sem registro no banco
- `20261117150000_card_funded_loan_no_account_debit`, `20261119220000_open_personal_wallet_to_all_users`, `20261119233000_wallet_allow_same_document_repeated_rows` não constam no histórico remoto com essas versões.
- Comparar o corpo de cada função no banco com o arquivo. Se já está equivalente, só registrar a versão (com autorização). Se não está, avaliar a migration isoladamente antes de aplicar — a de 19/11 abre a Carteira a todos os usuários e exige revisão de segurança.

### 0.5 (Opcional) Data da compra de empréstimo antigo
- Compra no cartão de empréstimo financiado criada antes de 25/11 continua com a data de digitação. Correção pontual de dados só com autorização específica e registro de auditoria.

---

## Fase 1 — Ciclo do cartão (itens 4, 1, 3, 2)

Base comum: **um único resolvedor de datas do ciclo**, `private.wallet_card_cycle_dates(card, mês_de_vencimento) → (fechamento, vencimento)`, com espelho TS em `getInvoiceCycleDates`. A precedência é: fechamento informado para o mês → configuração vigente no mês → regra do modo (dia fixo ou dias antes do vencimento) → ajuste de dia útil. `wallet_card_cycle_due_for_date` e a tela passam a usar só esse resolvedor.

### 1.0 Resolvedor sem mudança de comportamento
- Extrair o cálculo atual para o resolvedor (SQL e TS) e provar, com os casos de teste atuais e novos, que nenhum resultado muda.

### 1.1 Mudança no cartão vale do mês em diante (item 4)
- Tabela `personal_wallet_card_cycle_settings` (cartão, mês de início, modo de fechamento, dia de fechamento, dias antes do vencimento, dia de vencimento, vencimento em dia útil), com RLS por dono.
- Migration cria **uma linha por cartão** com a configuração atual, vigente desde o início do histórico (aditiva; não altera lançamentos).
- Editar fechamento/vencimento cria uma linha vigente a partir do mês da edição; meses anteriores usam a linha anterior.
- **Aceite:** depois de mudar o fechamento do dia 25 para o dia 20, as faturas antigas continuam mostrando "fecha 25"; a fatura do mês da edição em diante mostra "fecha 20".
- O limite não entra nesta tabela: o limite já tem referência própria do banco.

### 1.2 Fechamento dinâmico (item 1)
- Modo `DAYS_BEFORE_DUE`: fechamento = vencimento − N dias corridos (N entre 1 e 20). Padrão do cartão continua `FIXED_DAY`.
- Tela de cartão: escolha "Fecha em dia fixo" ou "Fecha N dias antes do vencimento", com aviso quando a distância for incomum (menos de 5 ou mais de 15 dias).
- **Aceite:** com vencimento dia 5 e N = 10, os fechamentos caem em 26 ou 25 conforme o tamanho do mês anterior; compra no próprio dia do fechamento vai para a fatura seguinte.

### 1.3 Vencimento em dia útil (item 3)
- Opção por cartão. Quando o vencimento cai em sábado, domingo ou feriado nacional, passa para o próximo dia útil.
- Feriados: função `private.br_national_holiday(date)` com feriados fixos e os móveis derivados da Páscoa (Carnaval segunda e terça, Sexta-feira Santa, Corpus Christi). Sem feriados municipais e estaduais (limitação declarada na tela).
- No modo dinâmico, o fechamento é calculado a partir do vencimento **já ajustado**.
- **Aceite:** casos de teste com vencimento em sábado, domingo, 01/01, Sexta-feira Santa e Carnaval; mês e nome da fatura não mudam quando o ajuste cruza a virada do mês (a fatura continua sendo a do mês de vencimento original).

### 1.4 Fechamento informado para um mês (item 2)
- Coluna opcional `closing_date` em `personal_wallet_card_invoice_facts` (já guarda o vencimento real do mês), com a regra: fechamento < vencimento, no máximo 25 dias antes.
- Na fatura: ação "Informar fechamento deste mês", que vale só para esse mês. Para mudar os próximos, editar o cartão (1.1).
- A importação da fatura em PDF preenche o fechamento quando ele aparece no documento.
- **Aceite:** com o fechamento do mês informado, compras desse ciclo passam a ser roteadas por ele; compras já gravadas não se movem; o aviso "compra no dia do fechamento" aparece no lançamento.

---

## Fase 2 — Ferramentas (itens 8, 5, 7, 6)

### 2.1 "Considerar no limite do cartão?" (item 8)
- Coluna `affects_limit boolean default true` em `personal_wallet_expenses`; o cálculo de posição do cartão ignora `false`. Caso de uso: compra já descontada do limite por outro meio, assinatura cobrada fora do limite.
- **Aceite:** o padrão não muda nenhum limite; marcar como "não considerar" altera o limite estimado, mas a fatura continua somando o valor; o limite de origem bancária não é afetado.

### 2.2 Reabrir fatura paga (item 5)
- RPC que estorna os pagamentos da fatura **por lançamento de estorno, sem apagar**: devolve o valor à conta de origem, as parcelas voltam a pendente e o limite volta a ser consumido.
- Bloqueios: fatura com fatura posterior já paga com base nela, pagamento de outro perfil, ou referência do banco já confirmada (pede confirmação explícita).
- **Aceite:** reabrir e pagar de novo deixa conta, limite e fatura exatamente como antes; histórico mostra o pagamento original e o estorno; replay não estorna duas vezes.

### 2.3 Saldo atual × saldo previsto nas contas (item 7)
- **Etapa A (somente leitura):** "Saldo previsto" por conta e total = saldo atual − contas a pagar pendentes − faturas a vencer vinculadas à conta + recebimentos previstos, com legenda de origem, período e precisão. Usa dados que já existem (`personal_wallet_payables`, obrigações recorrentes, faturas). Nenhuma mudança de schema.
- **Etapa B (só se a A não bastar):** status pendente/efetivado em `personal_wallet_account_operations`, com efetivação idempotente e efetivação parcial. Exige autorização própria, por mexer no saldo.
- **Aceite da A:** saldo atual não muda; o previsto bate com a soma dos itens listados, linha por linha.

### 2.4 Lembretes de fechamento e vencimento (item 6)
- **Etapa A:** aviso no app (sino e Visão geral) quando faltam 3 dias ou menos para fechar ou vencer uma fatura, usando o resolvedor da Fase 1.
- **Etapa B:** notificação push, aproveitando `services/pushSubscription.service.ts` e uma rotina diária no servidor, com opção de desligar por cartão. Sem valores no texto da notificação (tela bloqueada).

---

## Situação em 27/11/2026

- Fase 0: entregue (0.1, 0.2, 0.3, 0.4). 0.5 opcional, não feito.
- Fase 1: entregue (1.0 a 1.4). Limitações: importação e linha do tempo usam ciclo de dia fixo; salvar cartão faz duas chamadas.
- Fase 2: entregue 2.1, 2.2, 2.3A, 2.3B e 2.4A. **2.4B (push) pendente.**

## Fora do escopo agora

- **Open Finance (item 9):** depende de agregador contratado (custo, LGPD, consentimento, certificação). Registrar como estudo separado; nada desta fase deve impedir a futura importação automática.

## Ordem de execução e autorizações

| Ordem | Item | Muda banco? | Autorização necessária |
|---|---|---|---|
| 1 | 0.3 varredura | não | não |
| 2 | 0.1 restante da fatura | RPC nova | sim |
| 3 | 0.2 antecipação | RPC nova | sim |
| 4 | 0.4 migrations sem registro | talvez | sim, por migration |
| 5 | 1.0 resolvedor | função interna | sim |
| 6 | 1.1 histórico de configuração | tabela + dados iniciais | sim |
| 7 | 1.2 fechamento dinâmico | coluna | sim |
| 8 | 1.3 dia útil | função + coluna | sim |
| 9 | 1.4 fechamento do mês | coluna | sim |
| 10 | 2.1 considerar no limite | coluna | sim |
| 11 | 2.2 reabrir fatura | RPC nova | sim |
| 12 | 2.3A saldo previsto | não | não |
| 13 | 2.4A aviso no app | não | não |
| 14 | 2.3B / 2.4B | sim | sim |

## Riscos

- Divergência entre SQL e TS no ciclo: mitigada pelos casos de teste compartilhados.
- Feriados locais não cobertos: declarado na tela; o fechamento informado do mês (1.4) é a correção manual.
- Migrations aplicadas pelo painel: seguir o procedimento da skill (conferir base remota, transação, registro da versão, verificação).
