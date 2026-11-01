---
name: corrigir-sem-regressao
description: Corrija bugs existentes sem reabrir defeitos resolvidos ou afetar fluxos não relacionados. Use quando houver tela quebrada, erro de banco, build falhando ou comportamento que voltou a ocorrer.
---

1. Reproduzir e registrar resultado atual; se não reproduzir, explicar qual evidência falta.
2. Localizar a primeira versão comprovadamente boa, quando possível, e comparar diffs relevantes.
3. Identificar causa raiz, não apenas o sintoma, incluindo dependências e efeitos indiretos.
4. Criar um teste de regressão que falhe com o defeito e passe após a correção, quando tecnicamente viável.
5. Alterar o mínimo necessário, preservando outras edições em andamento e contratos de dados.
6. Rodar testes locais, fluxos adjacentes, E2E e build; inspecionar logs e efeitos no banco.
7. Documentar antes/depois, mudanças e riscos; não usar 'resolvido' sem teste verificável.
