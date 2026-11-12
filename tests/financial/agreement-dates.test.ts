import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  agreementPaymentDate,
  defaultAgreementFirstDueDate,
  isAgreementDueDateOverdue,
  toAgreementDateOnly,
} from '../../features/agreements/services/agreementDates';

// 12/11/2026 21:30 em Manaus = 13/11/2026 01:30 UTC.
const NIGHT_IN_MANAUS = new Date('2026-11-13T01:30:00Z');
const MORNING_IN_MANAUS = new Date('2026-11-12T13:00:00Z');

test('pagamento de acordo às 21h30 em Manaus é datado no mesmo dia civil', () => {
  assert.equal(agreementPaymentDate(NIGHT_IN_MANAUS), '2026-11-12');
  assert.equal(agreementPaymentDate(MORNING_IN_MANAUS), '2026-11-12');
});

test('parcela que vence hoje não fica atrasada à noite; a de ontem sim', () => {
  assert.equal(isAgreementDueDateOverdue('2026-11-12', NIGHT_IN_MANAUS), false);
  assert.equal(isAgreementDueDateOverdue('2026-11-12T00:00:00Z', NIGHT_IN_MANAUS), false);
  assert.equal(isAgreementDueDateOverdue('2026-11-11', NIGHT_IN_MANAUS), true);
  assert.equal(isAgreementDueDateOverdue(null, NIGHT_IN_MANAUS), false);
});

test('primeiro vencimento padrão é amanhã em Manaus, não depois de amanhã', () => {
  assert.equal(defaultAgreementFirstDueDate(NIGHT_IN_MANAUS), '2026-11-13');
  assert.equal(defaultAgreementFirstDueDate(new Date('2026-12-31T23:00:00Z')), '2027-01-01');
});

test('datas digitadas são mantidas literalmente; inválidas usam o vencimento padrão', () => {
  assert.equal(toAgreementDateOnly('2026-12-05'), '2026-12-05');
  assert.equal(toAgreementDateOnly('2026-12-05T00:00:00-04:00'), '2026-12-05');
  assert.equal(toAgreementDateOnly(new Date('2026-12-05T12:00:00Z')), '2026-12-05');
  assert.equal(toAgreementDateOnly('lixo', NIGHT_IN_MANAUS), '2026-11-13');
  assert.equal(toAgreementDateOnly(undefined, NIGHT_IN_MANAUS), '2026-11-13');
});

test('serviços de acordo usam a regra de Manaus para a data enviada à RPC', () => {
  const service = readFileSync('features/agreements/services/agreementService.ts', 'utf8');
  const legacy = readFileSync('features/agreements/services/agreementService.legacy.ts', 'utf8');
  assert.match(service, /p_payment_date: agreementPaymentDate\(\)/);
  assert.match(legacy, /isAgreementDueDateOverdue\(/);
  assert.match(legacy, /defaultAgreementFirstDueDate\(\)/);
  for (const source of [service, legacy]) assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,\s?10\)/);
});
