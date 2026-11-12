/**
 * Auditoria de integridade — regra "data de hoje" (dia civil de vencimento).
 *
 * Regra canônica declarada no código: `utils/businessDate.ts` — o vencimento é regido
 * pelo dia civil de America/Manaus (UTC-4), não pela data UTC nem pelo fuso do aparelho.
 *
 * Testes marcados com `todo` PROVAM divergências existentes: eles afirmam o comportamento
 * correto e hoje falham (o runner informa como "todo", sem quebrar o CI). Quando a
 * divergência for corrigida, remova o `todo` para que vire bloqueio de regressão.
 * Nenhum código de produção é alterado por este arquivo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { businessDateInManaus } from '../../utils/businessDate';
import { getDaysDiff } from '../../utils/dateHelpers';
import { derivePayableStatus } from '../../components/wallet/payablesDomain';

// 12/11/2026 às 21:30 em Manaus = 13/11/2026 01:30 UTC.
const NIGHT_IN_MANAUS = Date.parse('2026-11-13T01:30:00Z');
// 12/11/2026 às 23:30 em Manaus = 13/11/2026 00:30 em São Paulo.
const LATE_NIGHT_IN_MANAUS = Date.parse('2026-11-13T03:30:00Z');
const DUE_TODAY = '2026-11-12';

function withTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
}

test('referência canônica: às 21h30 em Manaus o dia civil ainda é o de hoje', () => {
  assert.equal(businessDateInManaus(new Date(NIGHT_IN_MANAUS)), DUE_TODAY);
  assert.equal(businessDateInManaus(new Date(LATE_NIGHT_IN_MANAUS)), DUE_TODAY);
});

test('prova: a data UTC usada em 16 arquivos já virou o dia seguinte às 21h30 em Manaus', () => {
  // Documenta o fato que causa as divergências abaixo (passa hoje e continuará passando).
  assert.equal(new Date(NIGHT_IN_MANAUS).toISOString().slice(0, 10), '2026-11-13');
});

test('Carteira: conta a pagar que vence hoje não pode aparecer como atrasada às 21h30 em Manaus',
  { todo: 'payablesDomain.derivePayableStatus usa a data UTC como padrão de "hoje"' }, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NIGHT_IN_MANAUS });
    const status = derivePayableStatus({ total_amount: 100, outstanding_balance: 100, due_date: DUE_TODAY });
    assert.equal(status, 'PENDING');
  });

test('Contratos: dias de atraso no aparelho em Manaus (comportamento correto hoje)', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: LATE_NIGHT_IN_MANAUS });
  assert.equal(withTimeZone('America/Manaus', () => getDaysDiff(DUE_TODAY)), 0);
});

test('Contratos: dias de atraso não podem depender do fuso do aparelho (São Paulo, 23h30 em Manaus)',
  { todo: 'utils/dateHelpers.getDaysDiff usa o fuso do aparelho, não America/Manaus' }, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: LATE_NIGHT_IN_MANAUS });
    assert.equal(withTimeZone('America/Sao_Paulo', () => getDaysDiff(DUE_TODAY)), 0);
  });

test('Servidor (Edge Functions em UTC): dias de atraso às 21h30 em Manaus',
  { todo: 'getDaysDiff sem data de referência no servidor usa o dia UTC' }, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NIGHT_IN_MANAUS });
    assert.equal(withTimeZone('UTC', () => getDaysDiff(DUE_TODAY)), 0);
  });

// Inventário estático: pontos que calculam "hoje" em UTC em regras de vencimento, oferta ou pagamento.
const UTC_TODAY = /new Date\(\)\.toISOString\(\)\.slice\(0,\s?10\)/;
const KNOWN_UTC_TODAY_SITES = [
  'features/agreements/services/agreementService.ts',      // p_payment_date do pagamento de acordo (grava no banco)
  'features/agreements/services/agreementService.legacy.ts',
  'components/wallet/payablesDomain.ts',                   // status OVERDUE da Carteira
  'domain/finance/riskAnalysis.ts',                        // validade de oferta de pagamento
  'utils/loanFilterResolver.ts',                           // validade de oferta de pagamento
  'features/portal/mappers/portalDebtRules.ts',            // validade de oferta no portal do cliente
  'components/cards/components/InstallmentGrid.tsx',       // validade de oferta na grade de parcelas
  'components/cards/hooks/useLoanCardComputed.ts',         // "hoje" do cartão de contrato
  'ai/tools/read/tools.ts',                                // data de referência das ferramentas de IA
  'supabase/functions/ai-assistant/index.ts',              // atraso nas respostas do Flux
  'supabase/functions/capitalflow-n8n-tools/index.ts',     // p_reference_date da cobrança automática
];

for (const file of KNOWN_UTC_TODAY_SITES) {
  test(`inventário: ${file} deve obter "hoje" de America/Manaus`,
    { todo: 'usa new Date().toISOString().slice(0, 10)' }, () => {
      assert.doesNotMatch(readFileSync(file, 'utf8'), UTC_TODAY);
    });
}
