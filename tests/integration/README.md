# Testes transacionais e E2E

Esta camada complementa os testes unitários e pgTAP existentes com dependências reais e descartáveis.

## PostgreSQL real com Testcontainers

`tests/integration/postgres-concurrency.mjs` sobe PostgreSQL 17.6 em Docker via `@testcontainers/postgresql`, cria apenas o schema mínimo necessário e carrega diretamente a RPC `process_payment_v3_selective` da migration `20260912_harden_payment_idempotency_concurrency.sql`.

A suíte valida:

- a mesma chave de idempotência submetida simultaneamente;
- pagamentos concorrentes distintos sobre a mesma parcela;
- serialização real com advisory lock + `FOR UPDATE`;
- rejeição de cálculo obsoleto após alteração concorrente do saldo;
- rollback integral de parcela, fonte e transação após erro tardio;
- overpayment por bucket sem mutação parcial;
- 100 pagamentos concorrentes preservando saldo e ledger.

Nenhum teste transacional aponta para produção.

Dependências usadas no CI, fixadas por versão: `@testcontainers/postgresql@12.1.0` e `pg@8.23.0`.

## Playwright

`tests/e2e/auth-demo.spec.mjs` testa o app compilado em Chromium desktop e mobile sem credenciais reais. O fluxo usa a tela de login e o modo demonstração, evitando gravações no Supabase de produção.

O CI instala `@playwright/test@1.63.0` de forma isolada e executa Chromium.

## Fuzz e stress

- `tests/financial/financial-fuzz.ts`: 50.000 combinações determinísticas de principal, juros, multa e pagamento.
- `tests/load/app-stress.js`: chega a 100 usuários virtuais contra o servidor local. O script bloqueia alvo remoto por padrão.

## Execução local

```bash
npm install --no-save --package-lock=false @testcontainers/postgresql@12.1.0 pg@8.23.0 @playwright/test@1.63.0
npm run test:integration
npx playwright install chromium
npm run build
npm run test:e2e
npm run test:financial:fuzz
```

Para carga, tenha `k6` instalado e use apenas ambiente local/isolado.
