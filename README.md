# CapitalFlow

CapitalFlow é um sistema de gestão financeira e de crédito voltado ao ciclo completo de clientes, contratos, parcelas, recebimentos, renegociações, cobranças e conciliação.

O projeto segue uma regra central: **o backend financeiro é a fonte de verdade**. Interface, automações e integrações podem solicitar operações e apresentar resultados, mas não devem inventar valores, reescrever histórico financeiro de forma silenciosa ou substituir as regras do domínio.

## Princípios do projeto

- **Integridade antes de conveniência:** pagamentos e estornos críticos usam operações transacionais e idempotentes.
- **Cálculo determinístico:** principal, juros, multa, mora e saldos são derivados por regras financeiras explícitas.
- **Histórico auditável:** correções contábeis usam estorno, reclassificação ou eventos rastreáveis; registros históricos não são apagados para “fazer fechar”.
- **Fail closed:** se a operação financeira segura não estiver disponível, a interface bloqueia a mutação em vez de executar um caminho legado parcial.
- **Isolamento por tenant/perfil:** dados financeiros são limitados ao contexto autorizado e o frontend não utiliza `service_role`.
- **Automação assistiva:** WhatsApp/n8n auxilia atendimento e cobrança, mas não decide crédito, não promete aprovação e não fabrica fatos financeiros.
- **Incerteza histórica explícita:** dados legados ambíguos entram em fila de revisão; o sistema não presume que um lançamento ocorreu sem evidência.

## Arquitetura

- **Frontend:** React 19 + TypeScript + Vite.
- **Domínio:** regras financeiras em módulos isolados de UI, Supabase e serviços de infraestrutura.
- **Persistência:** PostgreSQL no Supabase com Row Level Security (RLS), migrations e funções transacionais.
- **Backend:** Supabase Edge Functions e Remote Procedure Calls (RPCs) para operações financeiras sensíveis.
- **Automação:** n8n + WAHA + Redis para atendimento e régua de cobrança.
- **Auditoria:** ledger/transações, grupos de pagamento, chaves de idempotência e reversões vinculadas.

## Desenvolvimento local

Requisito: Node.js 20 ou superior.

```bash
npm ci
npm run dev
```

## Qualidade

```bash
npm run test:quality
npm run test:automation
npm run test:load
```

`test:quality` executa build TypeScript/Vite, invariantes financeiras, verificações arquiteturais e testes determinísticos da automação. O smoke de carga usa k6 separadamente.

As migrations de produção ficam em `supabase/migrations`. Alterações de schema devem ser versionadas por migration e aplicadas de forma reproduzível.

O contrato de qualidade e as invariantes obrigatórias estão em [`docs/QUALITY.md`](docs/QUALITY.md). A arquitetura de WhatsApp e cobrança está em [`docs/capitalflow-n8n.md`](docs/capitalflow-n8n.md).

## Produção

A branch `main` é protegida por Quality Gates executados também em `push`. Um deploy só deve ser considerado validado depois que build, invariantes financeiras, arquitetura e smoke aplicáveis tiverem sido verificados.

Operações financeiras históricas que dependam de interpretação humana não devem ser corrigidas automaticamente apenas para eliminar divergências de relatório. Elas devem permanecer identificadas para reconciliação auditada.
