# Instruções para o Codex no computador com Docker

## Objetivo

Continuar o CapitalFlow **do estado atual**, fechar as pendências apontadas pelo usuário e provar o funcionamento com Supabase/PostgreSQL **local** antes de propor qualquer implantação. Não reiniciar o projeto nem refazer o Payment Engine V4, as seis Skills de consulta, n8n ou WAHA.

O commit de referência nesta máquina é `d95c938` (`main`). Antes de trabalhar, confira `git status`, branch, HEAD e diferenças com `origin/main`; preserve alterações locais que existirem no outro computador. Não presuma que código publicado e banco remoto estejam na mesma versão.

## Limites obrigatórios

- Custo adicional **R$ 0,00**. Não criar branch Supabase paga, contratar serviço, provisionar infraestrutura ou ativar recurso cobrado.
- **Não aplicar migrations, executar fixtures ou fazer testes destrutivos em produção.** Não alterar contratos, pagamentos, parcelas, acordos, saldos nem usuários reais. O projeto remoto principal não substitui staging.
- Usar apenas Docker/Supabase local e dados artificiais. Se faltar um staging remoto claramente isolado e gratuito, registrar a limitação; não usar produção por conveniência.
- Preservar RLS, auditoria, idempotência e ledger. O backend financeiro calcula; não corrigir valores apenas no frontend nem criar SQL administrativo genérico.
- Não habilitar multi-fonte, Skills financeiras ou automações novas antes de testes transacionais completos. Não criar MCP, RAG, fine-tuning ou agente novo nesta tarefa.

## 1. Preparar e validar o banco local

1. Conferir Node >= 20, Docker Desktop em execução, `docker info` e a versão/ajuda da Supabase CLI. Conferir `supabase/config.toml` e as instruções atuais da CLI antes de usar comandos que possam apagar dados; iniciar uma instância **local e descartável**.
2. Conferir variáveis de ambiente. `tests/db/run-local-db-tests.mjs` deve abortar se alguma URL apontar para `.supabase.co` ou para o projeto principal; não remover essa proteção.
3. Com o banco local isolado, aplicar as migrations versionadas **em ordem**, sem reescrever arquivos históricos nem duplicar versões. As quatro migrations de outubro que precisam de atenção são:
   - `20261004120000_platform_admin_personal_wallet_and_funding_allocations.sql`
   - `20261004150000_preserve_original_principal_on_edit.sql`
   - `20261004211030_allow_negative_source_balance_for_capital_advances.sql`
   - `20261005205751_finalize_personal_wallet_operations.sql`
4. Executar `npm run test:db` e os testes SQL em `supabase/tests/`. Se alguma migration ou teste falhar, localizar a causa e corrigir **aditivamente**, sem modificar uma migration já aplicada remotamente. Registrar versão aplicada, erro, correção e resultado.
5. A última migration que constava no projeto remoto principal na auditoria era `20261002135834_fix_payment_forgiveness_order_remote`. **Reconferir** antes de qualquer plano de implantação. Não reaplicá-la nem substituir o histórico remoto pela versão antiga `20261002153000`.

## 2. Fechar o fluxo de capital e aporte

- Reproduzir no banco local o caso da imagem: contrato com capital atual de R$ 400 e juros de 40%, editar para R$ 600. A distribuição deve aceitar R$ 600; **somente R$ 200** deve sair da fonte e entrar como novo aporte. Confirmar um único evento de ledger, `original_principal` preservado, saldo da fonte correto e **mesmo vencimento** da parcela.
- Conferir que a prévia de R$ 840 mostrada no formulário corresponde ao resultado autoritativo persistido. Hoje a RPC de aporte soma capital e valor da parcela, mas não recalcula os juros do aporte; decidir e implementar a regra financeira correta **no backend**, com teste de pagamento anterior, atraso, juros já recebidos, centavos e estorno. Não acrescentar 40% cegamente em todos os casos.
- Testar aporte direto e por edição com `200.50`, `200,50` e `1.200,50`; não permitir que `200.50` vire `20.050`. Parcela quitada/cancelada/renegociada não pode receber aporte.
- Corrigir **valor menor** conforme pedido: manter o valor inicial auditável, atualizar o valor econômico atual e reconciliar parcela, fonte e ledger por uma operação **atômica, autorizada, idempotente e reversível**. Não resolver com `UPDATE` direto no contrato. Testar com e sem recebimentos anteriores; se algum cenário não tiver regra segura, mantê-lo bloqueado e registrar precisamente o motivo.
- Testar falha no meio da operação, repetição da chave, duas operações concorrentes e estorno. Nenhuma falha pode deixar contrato, parcela, fonte e ledger divergentes.

## 3. Demais pendências funcionais

- **Recebimento parcial:** confirmar com o usuário a referência do prazo de 30 dias (data do pagamento ou vencimento anterior) se o código não a definir de modo inequívoco. Fazer o caminho padrão criar o próximo vencimento conforme a regra acordada; oferecer separadamente a opção de incorporar o saldo/encargos ao capital. Prévia, confirmação, execução, estorno e textos devem concordar. Não mudar a matemática no frontend.
- **Minha Carteira e Admin:** provar em banco local que as tabelas, RPCs e RLS das migrations funcionam, inclusive isolamento entre usuários, cartões, despesas, faturas, limite e saldos. Não considerar as telas prontas apenas porque o build passa.
- **Contrato multi-fonte:** permanece desabilitado. Só habilitar depois de criar/testar distribuição, recebimento, recuperação de principal, estorno e ledger proporcionais **na transação autoritativa**, sem quebrar contratos de fonte única.
- **Abas/status:** testar com fixtures ativo, quitado, atrasado, em acordo e renegociado. Cada contrato deve aparecer na aba correta; contrato quitado não conta como ativo na carteira. Verificar o caso `0ac871` apenas por leitura, sem editar registro real.
- **Interface:** validar no navegador desktop e celular os cabeçalhos, navegação inferior, chat/imagens, modais de carteira, imagem por link, paginação/navegação e carregamento de chunks após publicação. Não declarar validação visual a partir de `tsc` ou build. Evitar termos técnicos em mensagens voltadas ao cliente.

## 4. Quality Gates e evidências

Executar, após cada correção relevante, os testes específicos e ao final:

```text
npm run test:db
npm run test:financial
npm run test:financial-forgiveness
npm run test:architecture
npm run test:ui-copy
npm run test:automation
npm run test:quality
npm run lint
npm run build
git diff --check
```

`test:db` só conta como aprovação quando a etapa PostgreSQL local terminar; os testes em memória de idempotência/concorrência/rollback não a substituem. Conferir o diff completo e ausência de segredos, `service_role` no cliente, acesso direto indevido, bypass de RLS ou cálculo financeiro duplicado.

Atualizar `relatorio.md` e `docs/STAGING_FINANCIAL_VALIDATION.md` com **PASS/FAIL/BLOQUEADO** por item, comandos e resultados, migrations efetivamente aplicadas **em qual ambiente**, evidências de reconciliação e pendências. Separar claramente: código local, banco local, staging, produção e site publicado. Não afirmar que a correção está visível em `capflow.pages.dev` sem publicar e testar. Informar explicitamente dados reais alterados (**devem ser NÃO**) e custo gerado (**R$ 0,00**).
