# Implementacoes - JURIDICO ASSINATURAS

## 2026-06-14 - Atalho Juridico do Contrato e Filtro de Quitados
- **Objetivo:** Substituir o botao duplicado "Gerar" no detalhe do contrato por acesso direto ao modulo juridico de Confissao de Divida, com o contrato selecionado automaticamente, e impedir que contratos quitados aparecam na emissao juridica.
- **Arquivos Alterados:**
    - `/App.tsx`: O detalhe do contrato passou a enviar o usuario para `/legal/editor/{id}` ao acionar o botao juridico.
    - `/pages/ContractDetailsPage.tsx`: A prop de acao foi renomeada para o fluxo juridico e o texto do botao foi alterado de "Gerar" para "Juridico".
    - `/pages/LegalPage.tsx`: A rota `/legal/editor/{id}` agora abre diretamente a subview de Confissao de Divida, passa apenas contratos elegiveis juridicamente para emissao e altera o selo do card de Confissao de "Gerar" para "Juridico".
    - `/features/legal/components/ConfissaoDividaView.tsx`: A tela passou a aceitar `initialLoanId` para selecao automatica do contrato vindo da rota.
    - `/features/legal/components/ConfissaoDivida/useConfissaoDividaState.ts`: O hook passou a selecionar uma vez o contrato inicial quando ele existe na lista filtrada.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npx vite build` executado com sucesso.
- **Riscos/Observacoes:** Contratos quitados continuam disponiveis no Termo de Quitacao, mas deixam de aparecer na lista de Confissao de Divida porque essa lista agora usa a regra central `loanEngine.isLegallyActionable`.
- **Escopo:** Alteracao restrita ao fluxo juridico solicitado e ao botao do detalhe do contrato; sem refatoracao estrutural.

## 2026-06-14 - Selecao Direta pelo Botao Juridico do Card
- **Objetivo:** Garantir que o clique no botao Juridico dentro do card/acordo leve diretamente para a Confissao de Divida com o contrato clicado ja selecionado.
- **Arquivos Alterados:**
    - `/App.tsx`: A rota `/legal/editor/{id}` passou a atualizar o `selectedLoanId` mesmo quando o usuario ja esta na aba Juridico; o `LegalContainer` passou a receber o `navigate` direto para preservar rotas juridicas completas.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npx vite build` executado com sucesso.
- **Riscos/Observacoes:** Mantida a navegacao normal de detalhes do contrato dentro da `LegalPage`, que continua montando `/contrato/{id}` localmente.
- **Escopo:** Somente correcao de roteamento e selecao do contrato no fluxo Juridico.

## 2026-06-14 - Restauracao de Contratos com Saldo no Juridico
- **Objetivo:** Corrigir contratos com saldo aberto que nao apareciam no modulo Juridico por causa de filtro limitado a parcelas vencidas.
- **Arquivos Alterados:**
    - `/domain/loanEngine.ts`: A regra `isLegallyActionable` passou a refletir o criterio documentado: contrato aparece no Juridico quando possui saldo aberto acima do limite residual, independentemente de estar vencido; contratos quitados continuam fora.
- **Arquivos Novos:** Nenhum.
- **Validacao:** Simulacao local com contrato em dia e saldo aberto retornou `true`, contrato quitado retornou `false`; `npx vite build` executado com sucesso.
- **Riscos/Observacoes:** A alteracao amplia a listagem do Juridico para contratos abertos/em dia, preservando a exclusao de quitados.
- **Escopo:** Somente regra de elegibilidade do modulo Juridico.

## 2026-06-14 - Varredura de Status e Acoes do Juridico
- **Objetivo:** Corrigir erros logicos encontrados na varredura: filtros baseados apenas em `PAID`, acao vazia de renegociacao no card juridico e selecao incorreta de parcelas abertas.
- **Arquivos Alterados:**
    - `/utils/loanStatus.ts`: Criado helper central para normalizar status, identificar parcela paga/encerrada, calcular saldo aberto e detectar parcela aberta.
    - `/features/legal/components/TermoQuitacaoView.tsx`: Termo de Quitacao passou a usar a classificacao visual central `QUITADO`, aceitando status pagos em portugues e saldo zerado sem incluir contrato vazio indevidamente.
    - `/features/legal/components/NotificacaoCobrancaView.tsx`: Notificacao passou a usar `loanEngine.computeLoanStatus` e a primeira parcela aberta vencida, evitando depender apenas do status literal `LATE`.
    - `/pages/LegalPage.tsx`: O botao Renegociar do card no Juridico deixou de ser acao vazia e agora abre o modal de renegociacao com o contrato selecionado.
    - `/components/cards/LoanCardComposition/helpers.ts`, `/domain/filters/loanFilters.ts` e `/pages/ContractDetails/useContractDetailsState.ts`: Substituida a regra fragil `status !== 'PAID'` por helper de parcela aberta para proximo vencimento, ordenacao e selecao de pagamento.
- **Arquivos Novos:**
    - `/utils/loanStatus.ts`: Helper compartilhado de status/saldo de parcela.
- **Validacao:** `npx tsc -b --pretty false` e `npx vite build` executados com sucesso.
- **Riscos/Observacoes:** O helper padroniza status equivalentes (`PAID`, `PAGO`, `QUITADO`, `QUITADA`, `FINALIZADO`) e ignora parcelas renegociadas/canceladas como abertas.
- **Escopo:** Correcoes restritas a status, filtros e acoes funcionais detectadas na varredura.

## 2026-06-14 - Registros de Contrato na Confissao de Divida
- **Objetivo:** Corrigir a secao "06 Registros do Contrato" para exibir documentos juridicos ja gerados e manter disponiveis os links de assinatura para recopia.
- **Arquivos Alterados:**
    - `/features/legal/components/ConfissaoDivida/useConfissaoDividaState.ts`: O historico passou a recarregar automaticamente ao selecionar/trocar o contrato; o documento recem-registrado entra de forma otimista na lista e permanece como fallback se o refresh do banco demorar ou falhar.
- **Arquivos Novos:** Nenhum.
- **Validacao:** `npx tsc -b --pretty false` e `npx vite build` executados com sucesso.
- **Riscos/Observacoes:** Consulta de metadados no Supabase confirmou que os registros recentes estao em `documentos_juridicos` com `loan_id` e `view_token`; a falha estava no estado da tela, que nao carregava o historico ao selecionar o contrato.
- **Escopo:** Somente carregamento/consistencia dos registros e links na Confissao de Divida.

## 2026-06-14 - Constraint de Papeis em Assinaturas
- **Objetivo:** Corrigir falha `assinaturas_documento_papel_check` ao assinar documentos juridicos.
- **Arquivos Alterados:**
    - `/IMPLEMENTACAO_RESUMO_JURIDICO_ASSINATURAS.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - `/supabase/migrations/20260614_fix_assinaturas_documento_papel_constraint.sql`: Atualiza a constraint `assinaturas_documento_papel_check` para aceitar os papeis normalizados pelas RPCs atuais (`DEBTOR`, `CREDITOR`, `WITNESS_1`, `WITNESS_2`) mantendo compatibilidade com os valores antigos em portugues.
- **Alteracao de Banco Executada:** Migration aplicada no Supabase remoto via `npx supabase db query --linked --file`.
- **Validacao:** Consulta ao catalogo confirmou a nova constraint; insercao temporaria com `papel = 'DEBTOR'` dentro de `BEGIN/ROLLBACK` executou com sucesso.
- **Riscos/Observacoes:** A correcao nao altera a logica de assinatura; apenas alinha a restricao do banco aos valores que as RPCs ja gravam.
- **Escopo:** Apenas constraint de banco da tabela `assinaturas_documento`.

## 2026-06-14 - Saude das Tabelas de Assinatura
- **Objetivo:** Verificar e corrigir inconsistencias nas tabelas juridicas apos leitura via Supabase CLI.
- **Arquivos Alterados:**
    - `/IMPLEMENTACAO_RESUMO_JURIDICO_ASSINATURAS.md`: Registrada a auditoria e as correcoes aplicadas.
- **Arquivos Novos:**
    - `/supabase/migrations/20260614_fix_documentos_juridicos_signature_status.sql`: Permite `EM_ASSINATURA`, ajusta a regra de `signed_at`, corrige documentos com assinatura parcial ainda marcados como `PENDENTE` e atualiza a RPC publica para preencher `signed_at` quando finalizar como `ASSINADO`.
    - `/supabase/migrations/20260614_fix_signature_rpc_required_roles_array.sql`: Corrige a montagem de `v_required_roles` na RPC `sign_documento_juridico_by_view_token`, usando arrays explicitos em vez de concatenar texto solto.
- **Alteracao de Banco Executada:** Migrations aplicadas no Supabase remoto via `npx supabase db query --linked --file`.
- **Validacao:** Teste de update para `EM_ASSINATURA` passou em rollback; chamada da RPC publica em `BEGIN/ROLLBACK` retornou `{ success: true, status: 'EM_ASSINATURA' }`; `npx tsc -b --pretty false` executado com sucesso.
- **Riscos/Observacoes:** A leitura ainda encontrou constraints/indices duplicados herdados de migrations antigas, mas eles nao bloqueiam o fluxo de assinatura. Nao foram removidos para evitar alterar cascatas historicas sem necessidade operacional imediata.
- **Escopo:** Banco/RPC do fluxo de assinatura juridica; sem alteracao visual.

## 2026-05-09 (Parte 1)
- **Objetivo:** Corrigir erro ao aplicar novo aporte causado por overload ambiguo da RPC `apply_new_aporte_atomic`.
- **Arquivos Alterados:**
    - `/IMPLEMENTACAO_RESUMO.md`: Registrada a correcao aplicada.
- **Arquivos Novos:**
    - `/supabase/migrations/20260509_fix_apply_new_aporte_atomic_overload.sql`: Recria a RPC `apply_new_aporte_atomic` com uma unica assinatura compativel com o frontend, usando `owner_id` para validar o contrato, atualizando fonte, contrato, parcela alvo e ledger de forma atomica; remove a assinatura duplicada que causava ambiguidade no PostgREST.
- **Alteracao de Banco Executada:**
    - SQL aplicado no projeto Supabase remoto `hzchchbxkhryextaymkn` via `supabase db query --linked --file`.
    - Validacao no catalogo `pg_proc` confirmou apenas a assinatura `apply_new_aporte_atomic(uuid, uuid, numeric, uuid, uuid, text, uuid)`.
- **Validacao:** Chamada SQL com o contrato `2c0031fe-d2c5-4298-9231-964b195c407e` executada dentro de `BEGIN/ROLLBACK` com sucesso; consulta posterior confirmou que o teste nao persistiu transacao.
- **Riscos/Observacoes:** A correcao remove a ambiguidade entre assinaturas e preserva a logica financeira completa da versao funcional da RPC.
- **Escopo:** Apenas banco/RPC de novo aporte; sem alteracao visual ou componentes React.

## 2026-05-09 (Parte 5 - ExperiÃªncia de NavegaÃ§Ã£o de Cards)
- **Objetivo:** Transformar a expansÃ£o dos cartÃµes de contrato (`LoanCard` e `ClientGroupCard`) em modelo AcordeÃ£o, auto-foco (scroll) e garantir persistÃªncia ao navegar entre pÃ¡ginas.
- **Arquivos Alterados:**
    - `/components/cards/LoanCard.tsx`: Modificado o estado de expansÃ£o para depender do `selectedLoanId` global. Adicionada referÃªncia de elemento e `useEffect` com `scrollIntoView` para centralizar a tela no cartÃ£o assim que ele Ã© expandido.
    - `/components/cards/ClientGroupCard.tsx`: Modificado para expandir automaticamente se um dos contratos agrupados for o selecionado. Adicionado `scrollIntoView` suave para quando o usuÃ¡rio expande o grupo manualmente.
- **Arquivos Novos:** Nenhum.
- **ObservaÃ§Ãµes:** A persistÃªncia da abertura ("ao fechar o contrato, voltar para o contrato aberto") Ã© garantida porque o `selectedLoanId` Ã© sincronizado no `localStorage` via `useUiState`.
- **Escopo:** UI/UX dos cartÃµes do Dashboard e LegalPage.

