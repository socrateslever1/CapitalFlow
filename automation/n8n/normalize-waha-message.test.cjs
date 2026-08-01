'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBrazilianWhatsappPhone,
  normalizeWahaMessage,
} = require('./normalize-waha-message.cjs');

const tenantMap = { default: '00000000-0000-4000-8000-000000000001' };

test('normaliza nono digito de celular brasileiro retornado pelo WhatsApp', () => {
  assert.equal(normalizeBrazilianWhatsappPhone('559293836812'), '5592993836812');
  assert.equal(normalizeBrazilianWhatsappPhone('559232345678'), '559232345678');
  assert.equal(normalizeBrazilianWhatsappPhone('5592993836812'), '5592993836812');
});

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

test('usa o telefone alternativo quando o remetente principal é um LID oculto', () => {
  const result = normalizeWahaMessage(payload({
    from: '123456789012345@lid',
    remoteJidAlt: '5592999999999@s.whatsapp.net',
  }), { tenantMap });

  assert.equal(result.accepted, true);
  assert.equal(result.value.phone, '5592999999999');
  assert.equal(result.value.remote_jid, '123456789012345@lid');
});

test('encaminha LID sem telefone alternativo para resolução no WAHA', () => {
  const result = normalizeWahaMessage({
    event: 'message',
    session: 'default',
    payload: {
      from: '78486903496856@lid',
      id: 'lid-only-message',
      type: 'text',
      body: 'Olá',
    },
  }, {
    tenantMap,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.value.phone, '');
  assert.equal(result.value.sender_lid, '78486903496856@lid');
  assert.equal(result.value.requires_lid_resolution, true);
  assert.equal(result.value.remote_jid, '78486903496856@lid');
});

test('bloqueia mensagens automáticas da Vivo antes do atendimento', () => {
  const result = normalizeWahaMessage(payload({
    body: 'Mensagem enviada pela inteligência artificial da Vivo',
  }), { tenantMap });

  assert.deepEqual(result, { accepted: false, reason: 'automated_service' });
});

test('bloqueia respostas genéricas de outro robô para impedir loop', () => {
  const result = normalizeWahaMessage(payload({
    body: 'Sinto muito, ocorreu um erro inesperado. Tente novamente mais tarde',
  }), { tenantMap });

  assert.deepEqual(result, { accepted: false, reason: 'automated_service' });
});
