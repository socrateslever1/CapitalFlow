# CapitalFlow

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O contexto operacional documentado é a gestão financeira e de crédito, com perfis de acesso distintos. A interface deve atender ao uso em desktop e celular. A priorização de um segmento comercial específico de usuários permanece em aberto.

## Product Purpose

Gerenciar o ciclo de clientes, contratos, parcelas, recebimentos, renegociações, cobranças e conciliação. O sucesso depende de valores compreensíveis, facilidade de operação no celular e prevenção de erros financeiros.

## Operating Context

- Aplicação existente em React, TypeScript e Vite, com persistência e operações financeiras sensíveis no backend.
- Fluxos financeiros envolvem principal, juros, multa, mora, saldos, pagamentos e estornos, com histórico auditável.
- Automações de atendimento e cobrança são assistivas; não decidem crédito nem fabricam fatos financeiros.
- Desktop e celular exigem experiências adequadas a cada contexto, mantendo as mesmas regras de negócio.

## Capabilities and Constraints

- O backend financeiro é a fonte de verdade. A interface apresenta resultados e solicita operações sem inventar valores ou substituir as regras do domínio.
- Pagamentos e estornos críticos devem ser transacionais, auditáveis e idempotentes.
- Preservar o histórico financeiro. Correções devem manter rastreabilidade, sem apagar registros para eliminar divergências.
- Respeitar isolamento por tenant/perfil e autorização no servidor.
- Bloquear mutações financeiras quando a operação segura não estiver disponível.
- Tratar ambiguidades históricas explicitamente, sem presumir lançamentos sem evidência.
- Preservar contratos, dados, funcionalidades e identidade existentes em alterações fora de um pedido explícito de mudança.

## Brand Commitments

- Nome existente: CapitalFlow.
- Idioma: português do Brasil.
- Comunicação clara e precisa, especialmente em valores, composição financeira, estados e consequências das ações.
- Preservar a identidade visual existente em refinamentos; este registro não define um novo sistema visual.

## Evidence on Hand

- `README.md`: propósito, arquitetura, princípios financeiros e instruções de desenvolvimento.
- `types.ts`: terminologia do domínio, estados de contratos e parcelas, métodos de pagamento e níveis de acesso.
- `App.tsx`: implementação existente e integração das áreas do aplicativo e acessos públicos.
- `docs/QUALITY.md`: contrato de qualidade e invariantes financeiras.
- `docs/capitalflow-n8n.md`: documentação de atendimento e cobrança.
- Código, componentes e assets existentes são evidência do produto implementado; não comprovam, por si só, operação em produção, validação visual ou resultados comerciais.
- Não foram fornecidas evidências de depoimentos, métricas comerciais ou diferenciais exclusivos de mercado; não inventar essas alegações.

## Product Principles

1. Tornar valores, saldos e composição financeira claros para que o usuário compreenda o que está consultando ou executando.
2. Facilitar tarefas no celular, respeitando também as necessidades de operação no desktop.
3. Prevenir erros financeiros com validações, estados claros e proteção contra operações repetidas.
4. Preservar integridade, autorização e rastreabilidade antes de conveniência operacional.
5. Expor incertezas e falhas com clareza, sem apresentar informações não verificadas como fatos.

## Accessibility & Inclusion

Garantir leitura compreensível de informações financeiras, navegação por teclado, foco visível, controles adequados ao toque e mensagens de erro úteis. Estados e consequências não devem depender apenas de cor. Conteúdo e ações devem permanecer acessíveis em diferentes larguras de tela e com zoom.
