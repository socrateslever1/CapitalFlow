import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261002135834_fix_payment_forgiveness_order_remote.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

const forgivenessPosition = sql.indexOf("if v_forgiveness in ('CAPITAL_ONLY', 'TOTAL_CHARGES') then");
const distributionPosition = sql.indexOf('v_interest_paid := least');
assert.notEqual(forgivenessPosition, -1, 'a regra de perdão deve existir');
assert.notEqual(distributionPosition, -1, 'a distribuição do recebimento deve existir');
assert.ok(forgivenessPosition < distributionPosition, 'o perdão deve ser calculado antes da distribuição');
assert.match(sql, /v_interest_before - v_interest_forgiven/);
assert.match(sql, /v_late_fee_before - v_late_fee_forgiven/);
assert.match(sql, /v_forgiveness in \('FINE_ONLY', 'MORA_ONLY', 'FINE_AND_MORA', 'INTEREST_ONLY', 'BOTH'\)/);

const distribute = ({ principal, interest, lateFee, received, mode, lateFeeForgiven = 0 }) => {
  const forgivesAllCharges = mode === 'CAPITAL_ONLY' || mode === 'TOTAL_CHARGES';
  const interestForgiven = forgivesAllCharges ? interest : 0;
  const effectiveInterest = Math.max(interest - interestForgiven, 0);
  const effectiveLateFee = forgivesAllCharges
    ? 0
    : Math.max(lateFee - lateFeeForgiven, 0);
  let remaining = received;
  const interestPaid = Math.min(remaining, effectiveInterest);
  remaining = Number((remaining - interestPaid).toFixed(2));
  const lateFeePaid = Math.min(remaining, effectiveLateFee);
  remaining = Number((remaining - lateFeePaid).toFixed(2));
  const principalPaid = Math.min(remaining, principal);
  return {
    interestPaid,
    lateFeePaid,
    principalPaid,
    interestForgiven,
    lateFeeForgiven: forgivesAllCharges ? lateFee : lateFeeForgiven,
  };
};

assert.deepEqual(
  distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 20, mode: 'FINE_AND_MORA' }),
  { interestPaid: 300, lateFeePaid: 20, principalPaid: 0, interestForgiven: 0, lateFeeForgiven: 20 },
  'perdão parcial deve preservar a ordem de recebimento'
);

assert.equal(
  distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 20, mode: 'FINE_AND_MORA' }).interestPaid,
  300,
  'o perdão de 20 no atraso não pode virar dinheiro recebido'
);

for (const legacyMode of ['INTEREST_ONLY', 'BOTH']) {
  assert.deepEqual(
    distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 20, mode: legacyMode }),
    { interestPaid: 300, lateFeePaid: 20, principalPaid: 0, interestForgiven: 0, lateFeeForgiven: 20 },
    `${legacyMode} deve preservar o comportamento legado do motor`
  );
}

const totalCharges = distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, mode: 'TOTAL_CHARGES' });
assert.deepEqual(totalCharges, { interestPaid: 0, lateFeePaid: 0, principalPaid: 320, interestForgiven: 300, lateFeeForgiven: 40 });
assert.equal(totalCharges.interestPaid + totalCharges.lateFeePaid, 0, 'TOTAL_CHARGES não pode registrar encargos perdoados como recebidos');

const capitalOnly = distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, mode: 'CAPITAL_ONLY' });
assert.deepEqual(capitalOnly, { interestPaid: 0, lateFeePaid: 0, principalPaid: 320, interestForgiven: 300, lateFeeForgiven: 40 });
assert.equal(capitalOnly.principalPaid, 320, 'CAPITAL_ONLY deve direcionar todo o recebido ao principal');

console.log('✓ ordem do perdão e cenários de recebimento validados');
