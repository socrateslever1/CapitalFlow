'use strict';

const SUPPORTED_MESSAGE_TYPES = new Set(['text', 'chat', 'image', 'audio', 'voice', 'document']);

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function normalizeBoolean(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function resolveSenderJids(payload) {
  const candidates = [
    payload.from,
    payload.remoteJid,
    payload.key?.remoteJid,
    payload.remoteJidAlt,
    payload.key?.remoteJidAlt,
    payload._data?.key?.remoteJidAlt,
    payload._data?.Info?.Sender,
    payload._data?.Info?.Chat,
    payload.participant,
    payload.key?.participant,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const phoneJid = candidates.find((value) => /@(c\.us|s\.whatsapp\.net)$/i.test(value));
  const lidJid = candidates.find((value) => /@lid$/i.test(value));

  return {
    remoteJid: candidates[0] || '',
    identityJid: phoneJid || candidates[0] || '',
    lidJid: lidJid || '',
  };
}

function isAutomatedServiceMessage(value) {
  const message = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return [
    /mensagem enviada pela inteligencia artificial da vivo/,
    /\b(app vivo|produtos e servicos da vivo|sms da vivo|recarga.*vivo)\b/,
    /termos e condicoes de uso da vivo/,
    /escolha uma das opcoes apresentadas/,
    /limite de tentativas excedido/,
    /codigo (pix|perde a validade|tem validade)/,
    /protocolo de atendimento:\s*\d{8,}/,
    /ocorreu um erro inesperado.*tente novamente mais tarde/,
    /um erro inesperado me impediu de te ajudar/,
  ].some((pattern) => pattern.test(message));
}

function resolveOrganizationId(body, tenantMap = {}) {
  const session = String(firstNonEmpty(body.session, body.instance, body.instanceName, '')).trim();
  const receiver = onlyDigits(firstNonEmpty(body.me?.id, body.me?.phone, body.payload?.to, ''));

  return String(tenantMap[session] ?? tenantMap[receiver] ?? '').trim();
}

function normalizeWahaMessage(input, options = {}) {
  const body = input?.body ?? input ?? {};
  const payload = body.payload ?? {};
  const event = String(firstNonEmpty(body.event, body.eventType, '') ?? '').toLowerCase();
  const { remoteJid, identityJid, lidJid } = resolveSenderJids(payload);
  const fromMe = normalizeBoolean(firstNonEmpty(payload.fromMe, payload.key?.fromMe, false));
  const isGroup = remoteJid.endsWith('@g.us') || normalizeBoolean(payload.isGroup);
  const messageId = String(firstNonEmpty(payload.id, payload.messageId, payload.key?.id, '') ?? '').trim();
  const rawType = String(firstNonEmpty(payload.type, payload.messageType, payload._data?.type, 'text') ?? 'text').toLowerCase();
  const messageType = rawType === 'ptt' ? 'voice' : rawType;
  const message = String(firstNonEmpty(payload.body, payload.text, payload.caption, '') ?? '').trim();
  const identityIsLid = /@lid$/i.test(identityJid);
  const phone = identityIsLid ? '' : onlyDigits(identityJid.split('@')[0]);
  const organizationId = resolveOrganizationId(body, options.tenantMap);
  const session = String(firstNonEmpty(body.session, body.instance, body.instanceName, '') ?? '').trim();

  if (!['message', 'message.any'].includes(event)) return { accepted: false, reason: 'unsupported_event' };
  if (!remoteJid || isGroup) return { accepted: false, reason: 'group_or_invalid_sender' };
  if (fromMe) return { accepted: false, reason: 'from_me' };
  if (isAutomatedServiceMessage(message)) return { accepted: false, reason: 'automated_service' };
  if (!messageId) return { accepted: false, reason: 'missing_message_id' };
  if (!SUPPORTED_MESSAGE_TYPES.has(messageType)) return { accepted: false, reason: 'unsupported_message_type' };
  if ((!phone || phone.length < 10) && !lidJid) return { accepted: false, reason: 'invalid_phone' };
  if (!organizationId) return { accepted: false, reason: 'missing_organization_id' };

  return {
    accepted: true,
    value: {
      message_id: messageId,
      message,
      phone,
      sender_lid: lidJid,
      requires_lid_resolution: !phone && Boolean(lidJid),
      remote_jid: remoteJid,
      from_me: false,
      is_group: false,
      organization_id: organizationId,
      session_id: `${organizationId}:${phone}`,
      whatsapp_session: session,
      message_type: messageType,
      timestamp: firstNonEmpty(payload.timestamp, body.timestamp, new Date().toISOString()),
    },
  };
}

module.exports = {
  isAutomatedServiceMessage,
  normalizeWahaMessage,
  resolveOrganizationId,
  resolveSenderJids,
};
