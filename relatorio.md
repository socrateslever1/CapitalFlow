# Relatório de execução — CapitalFlow

## Execução local — 05/10/2026 (HEAD `501f80d`)

- **Ambiente:** PASS — Node `v24.14.0`, Docker `29.6.2`, Supabase CLI `2.119.0`; branch `main` limpa e sincronizada com `origin/main` no início.
- **Isolamento:** PASS — CLI sem projeto vinculado; nenhuma URL remota foi usada; `test:db` preserva o bloqueio de `.supabase.co` e do projeto principal.
- **Inicialização PostgreSQL local:** **BLOQUEADA** — todas as imagens locais foram obtidas, porém a aplicação das migrations para na primeira versão, `20260222_campaign_bot_trigger.sql`, com `relation "public.campaign_messages" does not exist`. O repositório não contém migration anterior que crie essa tabela nem um baseline completo. O arquivo histórico não foi reescrito e não foi inventado um esquema financeiro substituto.
- **Migrations de outubro:** **NÃO APLICADAS** — o bloqueio ocorre em `20260222`, antes de `20261004120000`, `20261004150000`, `20261004211030` e `20261005205751`.
- **`npm run test:db`: FAIL/BLOQUEADO** — idempotência, concorrência e rollback em memória passaram; a etapa PostgreSQL terminou com código 1 e não conta como aprovação.
- **`npm run test:quality`: PASS** — build, testes financeiros, perdão, Skills, Tools, MCP, arquitetura, textos e 32 testes de automação passaram.
- **Caso R$ 400 → R$ 600:** PASS somente em teste de domínio — valida a distribuição de R$ 600 e calcula aporte de R$ 200. A persistência, ledger, fonte, vencimento, juros e estorno permanecem **BLOQUEADOS** sem banco local migrável.
- **Automação n8n:** a cópia de compatibilidade foi normalizada para ficar byte a byte igual ao export canônico; 32/32 testes passaram.
- **Validação visual/publicação:** **NÃO EXECUTADA** — não houve publicação nem alegação sobre `capflow.pages.dev`.
- **Produção/staging:** não acessados nem alterados. A versão remota mais recente não foi reconfirmada porque não há staging isolado nem projeto vinculado nesta máquina.
- **Dados reais alterados:** **NÃO**. **Custo gerado:** **R$ 0,00**.

Data: 05/10/2026
HEAD inicial: `b91bf468acbb0a6ffaa66099ae72a078df76f3e4`  
Dados financeiros reais alterados: **NÃO**  
Custo adicional: **R$ 0,00**

## Evoluções solicitadas

| Item | Estado | Evidência / pendência |
|---|---|---|
| Super Admin exclusivo | PENDENTE | Migration, funções protegidas, serviço e tela criados. A migration ainda não foi aplicada no Supabase remoto. |
| Minha Carteira | NÃO OPERACIONAL | Contas, PIX, cartões, despesas, parcelamento, faturas, pagamento e indicadores existem no código. As tabelas necessárias não existem no banco remoto; falta aplicar e validar a migration em ambiente isolado antes da liberação. |
| Isolamento da carteira | PENDENTE DE BANCO | RLS exige simultaneamente `auth.uid()` proprietário e SUPER_ADMIN. A validação transacional aguarda Docker local. |
| Controle de funcionalidades | PENDENTE | Tabelas, catálogo, função administrativa e controles visuais foram criados. Falta validação em banco. |
| Modo suporte somente leitura | PENDENTE | Tabela, funções de início/fim e fluxo visual foram criados. Falta validação em banco e auditoria real. |
| Contratos legados | PASS | Código atual preserva `contratos.source_id`; testes financeiros existentes passaram. |
| Multi-fonte na criação | BLOQUEADO | O código-base permanece, mas a opção foi retirada da tela e o serviço falha fechado enquanto recebimento, estorno e ledger proporcional não estiverem concluídos e validados. |
| Recebimento multi-fonte | PENDENTE | Distribuição proporcional determinística foi criada e testada isoladamente. Payment Engine V4 ainda não consome allocations. |
| Estorno multi-fonte | PENDENTE | Falta persistir e reverter a distribuição original no Payment Engine V4. |
| Ledger multi-fonte | PENDENTE | Falta gerar os lançamentos por fonte dentro da operação financeira autoritativa. |
| RLS | PENDENTE | Políticas aditivas estão no arquivo de migration; falta aplicar e testar no banco. |

## Arquivos criados

- `supabase/migrations/20261004120000_platform_admin_personal_wallet_and_funding_allocations.sql`
- `supabase/migrations/20261004211030_allow_negative_source_balance_for_capital_advances.sql`
- `supabase/migrations/20261005205751_finalize_personal_wallet_operations.sql`
- `domain/finance/fundingAllocations.ts`
- `domain/finance/fundingAllocations.test.ts`
- `services/platformAdmin.service.ts`
- `services/personalWallet.service.ts`
- `pages/PlatformAdminPage.tsx`
- `pages/PersonalWalletPage.tsx`

## Arquivos modificados

- `App.tsx`
- `hooks/useAppState.ts`
- `hooks/usePersistedTab.ts`
- `layout/NavHub.tsx`
- `layout/BottomNav.tsx`
- `types.ts`
- `components/forms/LoanFormFinancialSection.tsx`
- `features/loans/domain/loanForm.mapper.ts`
- `features/loans/domain/loanForm.validators.ts`
- `features/loans/hooks/useLoanForm.ts`
- `services/contracts.service.ts`

## Testes

- Testes financeiros: **PASS**
- Perdão de encargos: **PASS**
- Skills, Tools e MCP read-only: **PASS**
- Arquitetura: **PASS**
- Textos da UI: **PASS**
- Automação n8n: **PASS**
- Distribuição multi-fonte unitária: **PASS**
- `lint` / TypeScript: **PASS**
- Build isolado: **PASS**
- `git diff --check`: **PASS**
- `test:db`: **BLOQUEADO** — Docker não está instalado/em execução. O teste abortou sem usar banco remoto.
- `test:quality`: **PASS** — build, testes financeiros, Skills, Tools, MCP, arquitetura, textos da interface e automação aprovados após a auditoria de regressões.

## Pendências das tarefas anteriores

- Aplicar e validar migrations no staging: **não feito**; não há staging local/seguro disponível.
- Testar banco real, concorrência financeira e reconciliação no Supabase: **não feito**; somente testes locais em memória foram executados.
- Teste de banco local completo: **bloqueado** por ausência do Docker.
- Validação visual em navegador/celular: **não comprovada** nesta execução.
- Auditoria remota identificou, sem alterar: 2 usuários Auth sem perfil, 1 contrato órfão e 5 contratos legados marcados como renegociados sem acordo ativo.
- O contrato `0ac871` foi corrigido no código para respeitar o acordo ativo; nenhum registro remoto foi alterado.

## Segurança

- Nenhum segredo, senha ou `service_role` foi adicionado.
- Nenhuma migration histórica foi apagada ou reescrita.
- Nenhum contrato, parcela, pagamento, saldo ou ledger existente foi alterado.
- A migration nova é aditiva, mas **não deve ser aplicada em produção antes da validação local/staging**.

## Auditoria de regressões — 04/10/2026

- **Corrigido:** contrato com uma única fonte não exige mais preenchimento manual do valor da fonte.
- **Corrigido:** saldo insuficiente não bloqueia novo contrato; a fonte pode ficar negativa, mantendo o aviso de confirmação.
- **Corrigido:** o principal pode ser aumentado na edição do contrato; somente a diferença é registrada como novo aporte pela operação financeira autoritativa.
- **Pendente:** redução direta do principal permanece bloqueada, contrariando o pedido posterior de corrigir um valor menor sem perder o valor inicial. Não pode ser liberada por atualização direta: faltam operação atômica, lançamento reverso na fonte e reconciliação de parcela/ledger.
- **Protegido:** contratos com acordo ativo não aceitam aumento e salvar novamente não duplica o aporte no fluxo normal.
- **Criado:** migration aditiva que permite o saldo da fonte ficar negativo durante novo aporte, preservando lock, idempotência, ledger e estorno.
- **Corrigido:** cadastro de despesa pessoal agora exige e permite escolher a conta ou cartão utilizado.
- **Concluído no código:** carteira pessoal controla contas, PIX, cartões, despesas, parcelas, faturas e pagamento de fatura com atualização atômica de saldo e limite.
- **Corrigido:** o atalho `Carteira` aparece na barra inferior do celular, ao lado de `Capital`, somente para a conta SUPER_ADMIN; no desktop aparece em `Menu Principal`.
- **Separado por segurança:** saldos pessoais não alteram fontes de capital dos contratos.
- **Corrigido:** troca de usuário não deixa aba exclusiva do proprietário aberta ou em branco.
- **Corrigido:** painel administrativo carrega o estado real das funcionalidades antes de permitir alteração.
- **Proteção aplicada:** multi-fonte permanece indisponível na interface enquanto os fluxos de recebimento, estorno e ledger ainda estiverem pendentes.
- **Pendente de banco:** aplicar e validar `20261004211030_allow_negative_source_balance_for_capital_advances.sql` e `20261005205751_finalize_personal_wallet_operations.sql` em ambiente local/staging; produção não foi alterada.

## Revisão do erro de edição — 05/10/2026

- **Corrigido no código:** ao editar R$ 400 para R$ 600 em fonte única, a distribuição é validada contra R$ 600, enquanto somente R$ 200 seguem para a RPC de aporte. Antes, o serviço comparava a distribuição de R$ 600 com o capital anterior de R$ 400 e impedia o salvamento.
- **Corrigido na tela:** o campo editável agora é identificado como capital atual, não principal original. Falhas ao salvar mostram mensagem compreensível, sem expor detalhes do banco.
- **Corrigido no aporte:** valores com ponto decimal não são mais multiplicados por cem; parcelas encerradas deixam de ser oferecidas como destino do aporte.
- **Validado localmente:** testes financeiros, teste de arquitetura, TypeScript e `git diff --check` passaram. Não houve teste de operação real em banco nem validação visual publicada.
- **`test:db`:** idempotência, concorrência e rollback em memória passaram; a etapa com PostgreSQL local foi bloqueada porque Docker não está disponível. Nenhum teste apontou para produção.
- **Não resolvido:** a migration que permite saldo negativo na fonte durante aporte não está aplicada no projeto remoto. A migration que adiciona `original_principal` também não; logo, a preservação explícita do valor inicial no banco ainda não está disponível.
- **Não resolvido:** o aumento do capital pela RPC mantém a data de vencimento, mas soma apenas o aporte ao principal e ao valor da parcela; ela não recalcula juros proporcionais ao aporte. O valor previsto no formulário pode, portanto, divergir do valor persistido. Isso exige regra financeira explícita e teste em banco antes de alterar o motor.
- **Não resolvido:** redução do capital com preservação do histórico; criação multi-fonte; recebimento parcial com novo vencimento como padrão; validação transacional da carteira pessoal/Admin; testes de banco, concorrência e reconciliação. Nenhuma dessas funções deve ser descrita como pronta.
- **Sem publicação:** as alterações desta revisão existem apenas no repositório local até passarem por publicação. Nenhum dado financeiro real ou migration remota foi alterado nesta revisão.

## Próximo bloqueio objetivo

Instalar/iniciar Docker e executar `npm run test:db`. Depois, aplicar a migration somente em um ambiente de staging seguro e concluir a integração transacional multi-fonte antes de habilitar a funcionalidade para usuários.
