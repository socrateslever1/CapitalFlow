# Correção isolada — seletor de banco e cofre da Carteira

**Data:** 2026-10-30  
**Base imutável:** `main` em `1be9c2770f026d1ce964b1ba31fae7e84ad51885`  
**Branch:** `fix/wallet-bank-picker-vault-isolated-20261030`  
**Publicação:** nenhuma. PR em modo rascunho para revisão.

## Causas confirmadas

1. Cadastro novo usava `<datalist>` nativo. Chrome/WebView controlam esse painel fora do layout React: não é possível limitar a lista ao corpo rolável nem controlar adequadamente sua posição diante do teclado.
2. Ao selecionar conta vinculada, a interface preenchia implicitamente `issuer` se vazio; nome impresso era preenchido automaticamente a partir do perfil e apagado ao alternar titular. Esses campos precisam permanecer independentes.
3. O cofre invalidava operações em andamento ao retornar do segundo plano no Android, mas não iniciava nova leitura ao recuperar visibilidade. A consulta podia ficar sem resposta visível. O mecanismo de tratamento expunha mensagens brutas de erros do banco.
4. O formulário protegido oferecia captura e regravação de CVC/CVV; o envelope criptografado v2 incluía o código, incompatível com a regra de não armazenar dados sensíveis de autenticação.

## Diagnóstico do Supabase — somente leitura

No projeto conectado, as funções `personal_wallet_get_card_vault(uuid)` e `personal_wallet_get_pin_profile()` existem com concessão EXECUTE para `authenticated`. Os logs de chamadas reais do Android mostraram HTTP 200 para **ambas** as RPCs em 30/10/2026 às 19:24 (registro do provedor). Isso descarta, naquelas chamadas, um erro HTTP 404 de RPC ausente ou uma negação HTTP 403. **Não comprova a causa exata da exceção do JavaScript** nem valida acesso em todas as sessões. Não foi inserido registro de teste, aplicado SQL, alterado schema nem RLS.

## Escopo das mudanças

- `WalletBankCombobox`: lista inline ARIA sem portal, filtragem por Unicode NFD, altura calculada pela interseção `visualViewport` + `[data-dialog-body]`, sem z-index elevado, com rolagem independente, Escape/Enter/setas, fechamento no blur, controle de toque sem selecionar durante scroll.
- `WalletCardsPage`: novo seletor, instituição independente do vínculo bancário e nome impresso não preenchido a partir do perfil. Valores financeiros, contratos e RPCs de gravação não alterados.
- `CardVaultModal`: recarregamento após suspensão, feedback limitado a sessão/rede/falha genérica; credenciais de login do aplicativo não alteradas.
- `CardProtectedFields` e `cardVault`: novos envelopes v2 armazenam somente o PAN criptografado, nunca CVC. Acesso a cofres antigos foi preservado e a migração para v2 deixa de perpetuar o CVC. **Dados legados existentes não foram apagados ou regravados em lote.**

## Limites de teste e integração

Os testes de banco por HTTP 200 não equivalem a teste autenticado end-to-end da sessão do usuário. As verificações de teclado/viewport em código e domínio não substituem um teste físico com o IME aberto em Android WebView. A PR #80 modifica `features/wallet/pages/WalletCardsPage.tsx` simultaneamente: integração futura precisa reconciliar as duas alterações. Não há acesso a worktrees locais não commitadas de outras sessões por este conector; nenhuma operação local destrutiva foi executada.

**Gates:** GitHub Actions Quality Gates e Android APK foram solicitados na branch isolada. Não publicar nem fazer merge enquanto não aprovados e não houver revisão do conflito.
