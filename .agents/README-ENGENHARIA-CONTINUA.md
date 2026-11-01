# Engenharia contínua — skills do Codex

Este repositório mantém as instruções específicas do CapitalFlow em `AGENTS.md`. Estas oito skills complementam essas regras e **não as substituem**.

| Skill | Quando usar |
|---|---|
| `contexto-verificavel` | Iniciar/retomar tarefa com análise do código e documento de continuidade |
| `raciocinio-computacional` | Modelar estados, invariantes, cálculos e concorrência |
| `planejar-e-executar` | Planejar e implementar mudanças verificáveis |
| `corrigir-sem-regressao` | Diagnóstico, correção de causa raiz e teste de regressão |
| `banco-seguro` | Mudanças persistentes, Supabase, SQL, RLS e migrations |
| `webdesign-profissional` | UX/UI responsiva, acessível e consistente |
| `qualidade-e-seguranca` | Revisão do diff, segurança e testes |
| `publicacao-verificada` | Build, APK, validação, publicação e rollback |

## Regras de integração

- `AGENTS.md`, regras financeiras e docs existentes têm precedência sobre instruções gerais.
- Não adicionar dados de exemplo nem reescrever o estado do CapitalFlow.
- Em cada tarefa, ler os artefatos reais, estabelecer critérios de aceite com base no modelo `docs/AI_TASK_ACCEPTANCE_TEMPLATE.md`, implementar apenas o escopo e registrar evidências no documento de continuidade.
- A existência de uma skill não significa que foi executada, nem que testes, publicação ou deploy foram realizados.
- Um único coordenador deve integrar mudanças. Subagentes podem investigar em leitura, evitando escritas concorrentes.
- Esta integração não altera runtime, deploy, banco de dados ou workflows.
