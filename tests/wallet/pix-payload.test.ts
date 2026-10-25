import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStaticPix } from '../../components/wallet/pixPayload';

test('gera BR Code com valor, descrição/txid e CRC16', () => {
  const payload = buildStaticPix({ key: 'pix@example.com', recipient: 'João da Silva', city: '', amount: 19.9, description: 'Pedido 42' });
  assert.match(payload, /^00020126/);
  assert.ok(payload.includes('540519.90'));
  assert.ok(payload.includes('BRASILIA'));
  assert.match(payload, /6304[0-9A-F]{4}$/);
});

test('rejeita valor inválido e aceita cidade silenciosa', () => {
  assert.throws(() => buildStaticPix({ key: 'x', recipient: 'Ana', amount: 0, description: 'X' }), /valor/i);
  assert.doesNotThrow(() => buildStaticPix({ key: 'x', recipient: 'Ana', description: 'X' }));
});
