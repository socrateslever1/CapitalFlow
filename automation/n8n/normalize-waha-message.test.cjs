'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWahaMessage } = require('./normalize-waha-message.cjs');

const tenantMap = { default: '00000000-0000-4000-8000-000000000001' };

function payload(overrides = {}) {
  return {
    body: {
      event: 'message',
      session: 'default',
      payload: {
        id: 'message-1',
        from: '5592999999999@c.us',
        fromMe: false,
        type: 'chat',
        body: 'Olá',
        ...overrides,
      },
    },
  };
}

test('normaliza mensagem privada válida e isola a sessão por organização e telefone', () => {
  const result = normalizeWahaMessage(payload(), { tenantMap });
  assert.equal(result.accepted, true);
  assert.equal(result.value.phone, '5592999999999');
  assert.equal(result.value.session_id, `${tenantMap.default}:5592999999999`);
});

test('descarta mensagem de grupo', () => {
  assert.deepEqual(
    normalizeWahaMessage(payload({ from: '120363000000000000@g.us' }), { tenantMap }),
    { accepted: false, reason: 'group_or_invalid_sender' },
  );
});

test('descarta mensagem enviada pelo robô', () => {
  assert.deepEqual(normalizeWahaMessage(payload({ fromMe: true }), { tenantMap }), {
    accepted: false,
    reason: 'from_me',
  });
});

test('descarta evento que não é mensagem', () => {
  const input = payload();
  input.body.event = 'session.status';
  assert.deepEqual(normalizeWahaMessage(input, { tenantMap }), {
    accepted: false,
    reason: 'unsupported_event',
  });
});

test('bloqueia processamento sem organização resolvida', () => {
  assert.deepEqual(normalizeWahaMessage(payload(), { tenantMap: {} }), {
    accepted: false,
    reason: 'missing_organization_id',
  });
});

test('exige identificador para permitir deduplicação', () => {
  assert.deepEqual(normalizeWahaMessage(payload({ id: '' }), { tenantMap }), {
    accepted: false,
    reason: 'missing_message_id',
  });
});
