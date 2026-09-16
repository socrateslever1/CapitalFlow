# Contrato de Qualidade — CapitalFlow

Este documento define o padrão mínimo obrigatório para alterações no CapitalFlow. O objetivo não é apenas “passar no build”, mas preservar integridade financeira, isolamento entre perfis, auditabilidade e previsibilidade operacional.

## Filosofia

O CapitalFlow deve preferir **correção e rastreabilidade** a atalhos. A interface solicita operações; o backend financeiro valida e executa. Automações coordenam ações, mas não substituem a fonte de verdade contábil.

## Invariantes obrigatórias

1. **Conservação monetária** — nenhum pagamento pode desaparecer, duplicar silenciosamente ou gerar componente negativo sem um evento explícito de estorno.
2. **Atomicidade e idempotência** — mutações financeiras críticas devem ocorrer em uma única transação de banco e aceitar repetição segura da mesma requisição.
3. **Reversão, não apagamento** — histórico financeiro confirmado não deve ser deletado para corrigir saldo; use lançamento de reversão/reclassificação com vínculo ao original.
4. **Backend autoritativo** — cálculos de saldo, encargos, situação da parcela e elegibilidade de cobrança pertencem ao domínio/backend.
5. **Isolamento de tenant/perfil** — dados de um perfil não podem ser consultados ou alterados por outro perfil fora das regras de acesso autorizadas.
6. **Sem `service_role` no cliente** — credenciais privilegiadas nunca devem aparecer em código executado no navegador.
7. **Fail closed** — se a RPC/serviço financeiro seguro estiver indisponível, a mutação deve ser bloqueada; não existe fallback cliente-side capaz de alterar parcialmente saldo, parcela ou ledger.
8. **Histórico incerto não é inventado** — lacunas legadas são sinalizadas para reconciliação. Não se cria pagamento, estorno ou origem de dinheiro sem evidência suficiente.
9. **Automação não decide crédito** — n8n/WhatsApp pode orientar, cobrar e encaminhar, mas não aprova empréstimo nem fabrica condição financeira.
10. **Migration reproduzível** — qualquer DDL de produção precisa existir em `supabase/migrations` com a mesma versão aplicada no Supabase.

## Quality Gates

A branch `main` executa os Quality Gates em push, além de pull requests e execução manual.

```bash
npm run test:quality
```

Esse comando precisa cobrir, no mínimo:

- build TypeScript/Vite;
- invariantes financeiras;
- regras arquiteturais;
- testes determinísticos de automação.

O smoke de carga continua disponível separadamente:

```bash
npm run test:load
```

## Verificações arquiteturais automáticas

O teste `tests/architecture/architecture-check.mjs` deve impedir regressões como:

- domínio importando UI, serviços ou Supabase;
- `service_role` em runtime de cliente;
- reintrodução de fallback legado para pagamento/estorno/quebra de acordo;
- remoção das RPCs atômicas obrigatórias;
- importação direta do serviço legado fora da fachada autorizada;
- regressão do scheduler de cobrança para uma janela inferior a 24h;
- documentação operacional divergente do workflow versionado;
- migration de produção ausente do Git.

## Integridade do banco de produção

O Supabase possui a função privada `private.financial_integrity_report()`, acessível apenas por contexto privilegiado de serviço. O bloco `hard_errors` deve permanecer zerado para:

- saldos negativos de parcelas;
- divergência entre `paid_total` e componentes pagos;
- parcelas de acordo pagas acima do valor programado;
- componentes de pagamento atômico incompatíveis com o valor bruto;
- transação com parcela conhecida e contrato ausente;
- amortização seletiva legada sem marcação semântica;
- acordo ativo desalinhado com o contrato.

O bloco `legacy_review` é deliberadamente diferente: ele representa casos históricos que exigem evidência humana antes de qualquer correção monetária. Esses sinais **não devem ser zerados artificialmente**.

## Cobrança 24h

O workflow `CapitalFlow - Regua de Cobranca` é avaliado pelo scheduler `0 * * * *`, uma vez por hora durante as 24 horas do dia. O backend continua responsável por decidir se há envio naquele horário com base em `send_hours`, cadência, pausas, resposta recente, promessa, contestação e estado financeiro atual.

Disponibilidade 24h não equivale a mensagem a cada hora.

## Definition of Done

Uma alteração financeira só é considerada concluída quando:

1. código e migration estão versionados;
2. o estado de produção foi verificado com consultas de integridade;
3. nenhum caminho inseguro legado foi reativado;
4. testes de qualidade passam;
5. documentação afetada foi atualizada;
6. qualquer incerteza histórica restante foi explicitamente registrada em vez de escondida.
