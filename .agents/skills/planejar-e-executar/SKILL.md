---
name: planejar-e-executar
description: Conduza uma mudança de software do pedido ao resultado verificável, preservando o escopo e evitando refatorações não solicitadas. Use em novas funcionalidades, ajustes e tarefas complexas.
---

1. Traduzir o pedido em objetivo mensurável, restrições, casos limite e não objetivos.
2. Inspecionar código e contratos reais. Se algo for desconhecido, buscar evidência antes de escrever.
3. Criar matriz de impacto dos arquivos, dependentes, migrações, permissões e interfaces.
4. Estabelecer critérios de aceitação testáveis antes de editar, usando `docs/AI_TASK_ACCEPTANCE_TEMPLATE.md` como referência.
5. Implementar a menor mudança coerente; manter uma só linha de execução para arquivos sobrepostos.
6. Testar erros, bordas, concorrência, desempenho e segurança conforme o domínio, além do caminho principal.
7. Executar as verificações de qualidade que existem no projeto; não simular resultados.
8. Atualizar status e evidências no documento de continuidade existente e declarar CONCLUÍDO apenas se todos os critérios obrigatórios passaram. Caso contrário, BLOQUEADO com motivo reproduzível.
