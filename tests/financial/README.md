# Testes de integridade financeira

Esta suíte cria gates automáticos para reduzir regressões financeiras antes de qualquer merge em `main`.

## Cobertura inicial

- conservação centavo a centavo na distribuição de pagamentos;
- prioridade juros → multa/mora → principal;
- pagamento parcial de juros sem amortização indevida do principal;
- tratamento de excedente sem desaparecimento de valor;
- estados básicos de parcela aberta/quitada;
- isolamento arquitetural do domínio em relação a Supabase, services e UI;
- detecção de referência a `service_role` no código de runtime;
- pgTAP para RLS e funções financeiras críticas;
- smoke de carga do app com k6.

## Comandos

```bash
npm run test:financial
npm run test:architecture
npm run test:quality
npm run test:load
```

Os testes SQL ficam em `supabase/tests/database/financial_integrity.test.sql` e devem rodar em Supabase local ou em ambiente isolado com `supabase test db`. Nunca usar a base de produção para testes destrutivos, concorrência ou carga.

## Próxima camada

A suíte seguinte deve adicionar integração transacional em banco isolado para pagamentos simultâneos, idempotência, estorno concorrente e fluxo completo `contrato → pagamento → renovação → estorno`. O uso de Testcontainers para Node deve ser adicionado somente com versão fixada no lockfile e sem apontar para produção.
