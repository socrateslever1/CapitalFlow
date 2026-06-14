# Implementacao - Dossie Operacional

## 2026-06-14 - Dossie, Mesa de Acoes e Cobranca
- **Objetivo:** Implementar as ideias escolhidas para o projeto: Dossie do Cliente, Mesa de Acoes, Juridico Acionavel, Regua de Cobranca, Assistente de Cobranca e cenarios de acordo sobre o simulador existente.
- **Arquivos Alterados:**
    - `/App.tsx`: Conectada a nova aba `DOSSIER`, com atalhos para contrato, juridico, simulador e renegociacao.
    - `/types.ts`: Adicionado o AppTab `DOSSIER`.
    - `/hooks/useAppState.ts`: A aba Dossie passou a entrar no hub padrao.
    - `/hooks/useNavigationStack.ts`: Dossie passou a se comportar como tela do hub.
    - `/layout/NavHub.tsx`: Incluido item Dossie no menu principal, inclusive para perfis com hub salvo antes da nova aba.
    - `/layout/BottomNav.tsx`: Incluido Dossie no menu mobile.
    - `/layout/HeaderBar.tsx`: Adicionados icone e rotulo da aba Dossie.
    - `/pages/ProfilePage.tsx`: Adicionado rotulo da aba Dossie na personalizacao de menus.
- **Arquivos Novos:**
    - `/pages/DossierPage.tsx`: Nova tela operacional com Mesa de Acoes, Dossie do Cliente, linha do tempo, Juridico Acionavel, Regua, Assistente de Cobranca e cenarios de acordo.
    - `/services/legalOperations.service.ts`: Servico leve para carregar documentos juridicos dos contratos e alimentar status/link no Dossie.
    - `/IMPLEMENTACAO_RESUMO_DOSSIE_OPERACIONAL.md`: Registro desta entrega.
- **Validacao:** `npx tsc -b --pretty false` e `npx vite build` executados com sucesso.
- **Riscos/Observacoes:** A Regua de Cobranca nesta etapa e operacional/manual: mostra etapas e alimenta mensagem/WhatsApp; automacao real por triggers/fila pode ser ligada depois sobre a base ja criada.
- **Escopo:** Entrega incremental de produto, sem alterar regras financeiras existentes nem substituir o simulador atual.
