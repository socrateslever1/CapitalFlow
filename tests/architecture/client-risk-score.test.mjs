import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('pages/ClientsPage.tsx', 'utf8');

test('cliente exibe score de risco em uma faixa própria do card', () => {
  assert.match(page, /getClientRiskProfile/);
  assert.match(page, /Risco/);
  assert.match(page, /clientRiskProfile\.score/);
  assert.match(page, /clientRiskProfile\.level/);
  assert.match(page, /Boolean\(loan\.clientId\) && loan\.clientId === client\.id/);
});
