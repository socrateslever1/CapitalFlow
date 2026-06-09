# Implementacoes - AMBIENTE E PORTAL DO CLIENTE

## 2026-06-09
- **Objetivo:** Corrigir configuracao dos arquivos `.env` e alinhar informacoes exibidas no Portal do Cliente com os dados usados na pagina principal.
- **Arquivos Alterados:**
    - `/.env.example`: Removida chave real de exemplo, corrigido modelo e adicionadas variaveis esperadas pelo app.
    - `/.env.local`: Configurado localmente com as variaveis necessarias; arquivo permanece ignorado pelo Git.
    - `/services/adapters/loanAdapter.ts`: Ajustado mapeamento de parcelas para priorizar `valor_parcela`, `data_vencimento`, `numero_parcela` e `valor_pago`, igual ao banco/pagina principal.
    - `/containers/clientportal/components/PortalContractItem.tsx`: Card do portal passa a respeitar acordo ativo ao calcular parcelas, saldo e status.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ambiente local e consistencia de dados do portal; sem alteracao em regras de pagamento.

## 2026-06-09 - Ajuste visual do formulario de contrato
- **Objetivo:** Corrigir desalinhamento dos campos na criacao de contrato, principalmente datas e caixas no mobile.
- **Arquivos Alterados:**
    - `/components/LoanForm.tsx`: Ajustado padding, largura do cabecalho e scroll interno para reduzir deslocamentos no modal.
    - `/components/forms/LoanFormClientSection.tsx`: Padronizada altura/largura dos campos do cliente e botao de busca.
    - `/components/forms/LoanFormFinancialSection.tsx`: Padronizadas classes base dos inputs e campos de data; datas agora ficam em coluna unica, com altura fixa e indicador de calendario estabilizado.
- **Validacao:** `npx vite build --outDir C:\tmp\capitalflow-build --emptyOutDir` executado com sucesso.
- **Escopo:** Ajuste visual/UX do formulario de contrato.
