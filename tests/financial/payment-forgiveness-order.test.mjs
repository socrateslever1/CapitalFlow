import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261002153000_fix_payment_forgiveness_order_remote.sql'
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

const distribute = ({ principal, interest, lateFee, received, lateFeeForgiven }) => {
  const effectiveLateFee = Math.max(lateFee - lateFeeForgiven, 0);
  let remaining = received;
  const interestPaid = Math.min(remaining, interest);
  remaining = Number((remaining - interestPaid).toFixed(2));
  const lateFeePaid = Math.min(remaining, effectiveLateFee);
  remaining = Number((remaining - lateFeePaid).toFixed(2));
  const principalPaid = Math.min(remaining, principal);
  return { interestPaid, lateFeePaid, principalPaid, lateFeeForgiven };
};

assert.deepEqual(
  distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 20 }),
  { interestPaid: 300, lateFeePaid: 20, principalPaid: 0, lateFeeForgiven: 20 },
  'perdão parcial não pode virar dinheiro recebido'
);

const totalCharges = distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 40 });
assert.deepEqual(totalCharges, { interestPaid: 300, lateFeePaid: 0, principalPaid: 20, lateFeeForgiven: 40 });

const capitalOnly = distribute({ principal: 1000, interest: 300, lateFee: 40, received: 320, lateFeeForgiven: 40 });
assert.equal(capitalOnly.principalPaid, 20, 'CAPITAL_ONLY deve direcionar o recebido ao principal');

console.log('✓ ordem do perdão e cenários de recebimento validados');
