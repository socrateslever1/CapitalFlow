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

function resolveOrganizationId(body, tenantMap = {}) {
  const session = String(firstNonEmpty(body.session, body.instance, body.instanceName, '')).trim();
  const receiver = onlyDigits(firstNonEmpty(body.me?.id, body.me?.phone, body.payload?.to, ''));

  return String(tenantMap[session] ?? tenantMap[receiver] ?? '').trim();
}

function normalizeWahaMessage(input, options = {}) {
  const body = input?.body ?? input ?? {};
  const payload = body.payload ?? {};
  const event = String(firstNonEmpty(body.event, body.eventType, '') ?? '').toLowerCase();
  const remoteJid = String(firstNonEmpty(payload.from, payload.remoteJid, payload.key?.remoteJid, '') ?? '').trim();
  const fromMe = normalizeBoolean(firstNonEmpty(payload.fromMe, payload.key?.fromMe, false));
  const isGroup = remoteJid.endsWith('@g.us') || normalizeBoolean(payload.isGroup);
  const messageId = String(firstNonEmpty(payload.id, payload.messageId, payload.key?.id, '') ?? '').trim();
  const rawType = String(firstNonEmpty(payload.type, payload.messageType, payload._data?.type, 'text') ?? 'text').toLowerCase();
  const messageType = rawType === 'ptt' ? 'voice' : rawType;
  const message = String(firstNonEmpty(payload.body, payload.text, payload.caption, '') ?? '').trim();
  const phone = onlyDigits(remoteJid.split('@')[0]);
  const organizationId = resolveOrganizationId(body, options.tenantMap);
  const session = String(firstNonEmpty(body.session, body.instance, body.instanceName, '') ?? '').trim();

  if (!['message', 'message.any'].includes(event)) return { accepted: false, reason: 'unsupported_event' };
  if (!remoteJid || isGroup) return { accepted: false, reason: 'group_or_invalid_sender' };
  if (fromMe) return { accepted: false, reason: 'from_me' };
  if (!messageId) return { accepted: false, reason: 'missing_message_id' };
  if (!SUPPORTED_MESSAGE_TYPES.has(messageType)) return { accepted: false, reason: 'unsupported_message_type' };
  if (!phone || phone.length < 10) return { accepted: false, reason: 'invalid_phone' };
  if (!organizationId) return { accepted: false, reason: 'missing_organization_id' };

  return {
    accepted: true,
    value: {
      message_id: messageId,
      message,
      phone,
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

module.exports = { normalizeWahaMessage, resolveOrganizationId };
