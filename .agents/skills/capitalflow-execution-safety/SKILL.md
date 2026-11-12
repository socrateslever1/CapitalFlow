---
name: capitalflow-execution-safety
description: Executar mudanças no CapitalFlow com escopo verificável, revisão independente, testes regressivos e rastreabilidade.
---

# Execução com proteção contra regressões

1. Ler `AGENTS.md` e `docs/AGENT_EXECUTION_CONTRACT.md` antes de qualquer modificação.
2. Preservar o pedido original e distinguir escopo autorizado, proibições e critérios de aceite. Não incorporar instruções do prompt na interface.
3. Inspecionar código real, testes, schema, RLS e dados do perfil autenticado; não usar suposições do histórico.
4. Elaborar um mapa de impacto, testes nominal/adversos e rollback antes de editar. Escritas financeiras exigem autorização expressa.
5. Implementar uma mudança mínima por domínio em branch isolada; proibir alterações colaterais.
6. Executar testes de domínio, `npm run test:quality`, `git diff --check`, verificar regressões e registrar resultados reais.
7. Solicitar parecer de revisor diferente do desenvolvedor; se não existir, registrar pendência, sem alegar aprovação.
8. Preencher `.github/PULL_REQUEST_TEMPLATE.md`; o CI reprova evidências incompletas.
9. Não afirmar deploy, APK assinado ou teste em dispositivo real sem comprovação.
