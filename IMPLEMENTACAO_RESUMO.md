# Implementacoes - Indice

Este arquivo e apenas um indice dos resumos de implementacao.

A partir desta organizacao, cada mudanca significativa deve ser registrada no arquivo da categoria correspondente, sem misturar frentes diferentes no mesmo documento.

## 2026-07-03
- **Objetivo:** Corrigir erro `parcelas_unique_loan_numero` ao editar contrato parcelado fixo e manter o parcelamento como contrato unico com varias parcelas.
- **Arquivos Alterados:**
    - `/features/loans/domain/loanForm.mapper.ts`: A preservacao de parcelas na edicao passou a manter o `id` original da parcela, vencimento e dados de pagamento/status ao casar parcelas por numero. Isso impede que a edicao gere novos IDs para parcelas ja existentes e tente reinserir `loan_id + numero_parcela` duplicado.
- **Arquivos Criados:** Nenhum.
- **Riscos/Observacoes:** A correcao evita a duplicidade na edicao. Contratos antigos que ja tenham sido criados como varios contratos separados exigem saneamento/migracao de dados especifica, fora desta alteracao.
- **Validacao:** `npm run build` executado com sucesso.
- **Escopo:** Alteracao restrita ao mapper do formulario de contrato. Nenhuma aparencia, rota ou layout global foi alterado.
## Arquivos por categoria
- `IMPLEMENTACAO_RESUMO_RENEGOCIACAO_ACORDOS.md` -> renegociacao, acordos, unificacao, Somente Capital e parcelamentos.
- `IMPLEMENTACAO_RESUMO_RECEBIMENTOS_COMPROVANTES.md` -> pagamentos, recebimentos, quitacao, comprovantes e recibos.
- `IMPLEMENTACAO_RESUMO_JURIDICO_ASSINATURAS.md` -> documentos juridicos, assinatura, confissao, promissoria e templates legais.
- `IMPLEMENTACAO_RESUMO_PORTAL_OFFLINE.md` -> portal do cliente, offline-first, service worker, outbox e sincronizacao local.
- `IMPLEMENTACAO_RESUMO_BANCO_RPC_SYNC.md` -> banco, migrations, RPCs, RLS, Supabase, sincronizacao e sessao.
- `IMPLEMENTACAO_RESUMO_UI_NAVEGACAO_MENUS.md` -> UI autorizada, cards, navegacao, menus, scroll e dashboard visual.
- `IMPLEMENTACAO_RESUMO_IMPORTACAO_CLIENTES_EQUIPE.md` -> clientes, importacao, equipe e operadores.
- `IMPLEMENTACAO_RESUMO_MANUTENCAO_AUDITORIA.md` -> auditoria, recalculos, indicadores, manutencao e verificacoes.
- `IMPLEMENTACAO_RESUMO_GERAL_OUTROS.md` -> somente para casos que nao se encaixem em categoria existente.

## Regra
- Nao registrar implementacao nova diretamente neste indice.
- Se a mudanca tiver mais de uma frente, registrar em arquivos separados por categoria.
- Se uma nova frente surgir, criar `IMPLEMENTACAO_RESUMO_<NOME_DA_ACAO>.md`.
- Cada arquivo deve conter apenas o que foi realmente implementado naquela categoria.
