# CapitalFlow — instruções de continuidade para agentes (Codex, Claude, ChatGPT)

## Antes de modificar
1. Consulte `PRODUCT.md`, `DESIGN.md`, `docs/CARTEIRA_CONTINUIDADE.md` e o código atual na `main`. Não trabalhe a partir da memória do chat.
2. Determine o escopo exato, os testes relacionados e os contratos afetados. Reutilize componentes compartilhados; preserve recursos existentes.
3. Para interface da Carteira, consulte `.agents/skills/impeccable/SKILL.md` e `.agents/skills/capitalflow-wallet-ux/SKILL.md`.

## Proteção financeira
- Não modifique RPCs, Supabase migrations, ledger, regras de fatura, liquidação, pagamento, estorno ou RLS sem pedido explícito.
- Nunca confunda saldo de conta com limite de crédito, compra registrada com parcela vencida, ou projeção com saldo efetivo.
- Preserve idempotência, centavos, integridade dos dados, isolamento por usuário e rotas mobile/desktop.
- Não armazene CVC/CVV em claro nem criptografado. Uma mudança envolvendo dados completos do cartão precisa de auditoria específica de segurança.

## Implementação
- Mantenha mudanças pequenas, reversíveis e no domínio correto, sem rewrites desnecessários.
- Não remova testes, workflows ou funcionalidades para obter compilação verde.
- Verifique mudanças anteriores com `git diff` e testes de arquitetura/financeiros/UX pertinentes.
- Qualquer painel financeiro assistivo deve ser READ_ONLY, com legenda clara sobre origem, intervalo e precisão dos valores.

## Entrega
- Antes do merge, executar `npm run test:quality`, `npm run test:wallet-visual-next` e testes relevantes.
- Falhas de segurança/dependências são reportadas; não declarar todos os gates aprovados se o Quality Gates estiver vermelho.
- Versão Android: conferir assinatura release, pacote, versão monotônica, commit exato e asset publicado. Build local/debug não comprova release.
- Atualizar `docs/CARTEIRA_CONTINUIDADE.md` com mudanças, commit, testes, limitações e pendências. Nunca afirmar validação visual em celular físico quando não ocorreu.
