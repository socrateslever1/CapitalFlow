# Implementacao - Vencimentos e Status

## 2026-06-14 - Sincronizacao de Vencimento das Parcelas
- **Objetivo:** Corrigir contrato `459f83ff-f683-4716-b03f-2fce3aa879e9`, que podia aparecer com atraso incorreto apesar de vencer em `2026-06-15`.
- **Causa Encontrada:** A parcela tinha `data_vencimento = 2026-06-15`, mas `due_date = 2026-06-14`. Alguns fluxos legados ainda leem `due_date`, gerando status visual divergente.
- **Arquivos Alterados:**
    - `/services/contracts.service.ts`: Ao criar/editar parcelas, grava `due_date` junto com `data_vencimento`.
    - `/domain/loanEngine.ts`: O motor de dominio passa a preferir `data_vencimento` quando receber objetos crus com mais de um campo de vencimento.
- **Arquivos Novos:**
    - `/supabase/migrations/20260614_sync_parcelas_due_date_with_data_vencimento.sql`: Sincroniza `due_date` com `data_vencimento` para parcelas divergentes.
    - `/IMPLEMENTACAO_RESUMO_VENCIMENTOS_STATUS.md`: Registro desta correcao.
- **Alteracao de Banco Executada:** Migration aplicada no Supabase remoto via `npx supabase db query --linked --file`.
- **Validacao:** Consulta confirmou `due_date = data_vencimento = 2026-06-15` no contrato `459f83`; consulta global retornou `total_mismatch = 0`; calculo local retornou `daysUntilDue = 1`; `npx tsc -b --pretty false` e `npx vite build` executados com sucesso.
- **Escopo:** Vencimento/status de parcelas; sem alteracao visual.

## 2026-06-14 - Correcao de Fuso nos Cards de Contrato
- **Objetivo:** Evitar que uma parcela com vencimento literal em `2026-06-15` apareca como atrasada no dia `2026-06-14`.
- **Causa Encontrada:** Alguns pontos do card/grupo/detalhes usavam `new Date('YYYY-MM-DD')`. No fuso do Brasil, essa string pode ser interpretada como UTC e cair para a noite do dia anterior, gerando falso atraso no fim do dia.
- **Arquivos Alterados:**
    - `/domain/loanEngine.ts`: Status agora compara vencimentos com `parseDateOnlyUTC` e `todayDateOnlyUTC`.
    - `/components/cards/hooks/useLoanCardComputed.ts`: Ordenacao e proximo vencimento do card usam data literal.
    - `/components/cards/ClientGroupCard.tsx`: Filtros de vencidos/vencendo usam data literal.
    - `/domain/dashboard/loanGrouping.ts`: Agrupamento e ordenacao por vencimento usam data literal.
    - `/domain/filters/loanFilters.ts`: Ordenacao principal por vencimento usa data literal.
    - `/domain/finance/riskAnalysis.ts`: Analise de risco ordena parcelas por data literal.
    - `/pages/ContractDetails/useContractDetailsState.ts`: Detalhes de atraso e exibicao de proximo vencimento usam data literal.
- **Validacao de Banco:** Contrato `459f83ff-f683-4716-b03f-2fce3aa879e9` esta com `data_vencimento = 2026-06-15` e `due_date = 2026-06-15` no Supabase.
