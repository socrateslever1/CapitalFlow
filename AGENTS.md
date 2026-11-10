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

## Interface e Impeccable — padrão permanente
- Antes de qualquer alteração visível, executar a skill versionada `.agents/skills/impeccable/SKILL.md`, carregar `PRODUCT.md` e `DESIGN.md` e adotar o modo **Operate** para fluxos financeiros. Se o executor/CLI estiver indisponível, registrar a limitação, seguir as referências de qualidade e não afirmar execução do detector.
- Usar `impeccable context` uma vez por sessão, seguido de `critique`/`audit` quando aplicáveis, e `polish` para refinar a superfície afetada. Preservar identidade, tipografia Inter, cores existentes e componentes compartilhados; nunca redesenhar páginas não envolvidas.
- Exigir rótulos acessíveis, foco visível, contraste, touch targets de pelo menos 44px nas ações principais, estados de carregamento/erro/vazio, texto PT-BR, layout adaptativo e aprovação visual em mobile/tablet/web antes da publicação; documentar o que não foi possível conferir em tela.
- Não permitir que estética mascare uma inconsistência financeira. Controles de recebimento exibem o valor integral na conta, e a decomposição capital/juros exclusivamente no relatório contábil/auditoria. Nenhum texto das instruções do agente é conteúdo da interface.
