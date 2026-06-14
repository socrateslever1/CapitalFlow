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

