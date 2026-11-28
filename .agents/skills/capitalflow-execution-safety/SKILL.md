---
name: capitalflow-execution-safety
description: Executar mudanças no CapitalFlow com escopo verificável, revisão independente, testes regressivos e rastreabilidade.
---

# Execução com proteção contra regressões

1. Ler `AGENTS.md` e `docs/AGENT_EXECUTION_CONTRACT.md` antes de qualquer modificação.
2. Preservar o pedido original e distinguir escopo autorizado, proibições e critérios de aceite. Não incorporar instruções do prompt na interface.
3. Inspecionar código real, testes, schema, RLS e dados do perfil autenticado; não usar suposições do histórico.
4. Elaborar um mapa de impacto, testes nominal/adversos e rollback antes de editar. Escritas financeiras exigem autorização expressa.
5. Implementar uma mudança mínima por domínio; proibir alterações colaterais. **Destino do commit:** seguir a escolha do proprietário. O padrão atual dele é commit direto na `main` (produção), sem branch nem preview, e só depois dos gates locais e da revisão independente. Use branch e PR apenas quando o proprietário pedir.
6. **Atomicidade:** toda operação financeira com mais de uma escrita (cancelar e recriar, quitar e lançar o restante, pagar e debitar) deve ser **uma única RPC transacional e idempotente** (`request_id`). Nunca encadear chamadas de serviço no cliente para compor uma operação: uma falha no meio deixa o dado pela metade.
7. Executar testes de domínio, `npm run test:quality`, `npm run test:wallet-visual-next` e `git diff --check`; verificar regressões e registrar resultados reais. Depois do push, conferir Quality Gates, AI Routing e APK no GitHub Actions.
8. Solicitar parecer de revisor diferente do desenvolvedor (outra pessoa ou agente com contexto separado); se não existir, registrar pendência, sem alegar aprovação.
9. Em PR, preencher `.github/PULL_REQUEST_TEMPLATE.md`; o CI reprova evidências incompletas. Em commit direto, registrar as mesmas evidências na mensagem do commit e em `docs/CARTEIRA_CONTINUIDADE.md`.
10. **Migrations do Supabase:** só aplicar com autorização expressa. Antes, conferir no banco a versão atual de cada função substituída (corpo/tamanho e dependências) e as migrations locais ausentes do histórico remoto. Aplicar uma por vez, em transação, registrando a versão em `supabase_migrations.schema_migrations`. Depois, verificar existência, permissões (`anon` × `authenticated`) e um teste com dados fictícios. Nunca alterar dados existentes sem autorização específica.
11. **Repositório público:** não colocar valores, nomes, documentos, identificadores ou faturas reais de clientes ou do proprietário em código, testes, fixtures, docs, commits ou mensagens de PR. Usar dados fictícios.
12. Não afirmar deploy, APK assinado ou teste em dispositivo real sem comprovação.
