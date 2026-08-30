import assert from "node:assert/strict";
import { calculateMonthlyCycleLatePolicy } from "./lateFeePolicy";

const baseParams = {
  principal: 1000,
  currentInterest: 300,
  monthlyInterestPercent: 30,
  finePercent: 2,
  dailyInterestPercent: 1,
};

{
  const result = calculateMonthlyCycleLatePolicy({ ...baseParams, daysLate: 29 });
  assert.equal(result.completedCycles, 0);
  assert.equal(result.residualDays, 29);
  assert.equal(result.interest, 300);
  assert.equal(result.finePart, 0);
  assert.equal(result.moraPart, 377);
  assert.equal(result.total, 1677);
}

{
  const result = calculateMonthlyCycleLatePolicy({ ...baseParams, daysLate: 30 });
  assert.equal(result.completedCycles, 1);
  assert.equal(result.residualDays, 0);
  assert.equal(result.interest, 690);
  assert.equal(result.finePart, 26);
  assert.equal(result.moraPart, 0);
  assert.equal(result.total, 1716);
}

{
  const result = calculateMonthlyCycleLatePolicy({ ...baseParams, daysLate: 31 });
  assert.equal(result.completedCycles, 1);
  assert.equal(result.residualDays, 1);
  assert.equal(result.interest, 690);
  assert.equal(result.finePart, 26);
  assert.equal(result.moraPart, 16.9);
  assert.equal(result.total, 1732.9);
}
