const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'functions', 'capitalflow-n8n-tools', 'index.ts'),
  'utf8',
);

test('roteamento de IA permanece em shadow e sem escrita financeira', () => {
  assert.match(source, /mode:\s*"SHADOW"/);
  assert.match(source, /n8n_ai_conversation_states/);
  assert.match(source, /n8n_ai_intent_events/);
  assert.match(source, /FINANCIAL_BLOCKED/);
  assert.doesNotMatch(source, /aiRouting[\s\S]{0,500}process_financial_operation_v4/);
});

test('telemetria não persiste texto bruto da mensagem', () => {
  const helperStart = source.indexOf('async function persistAiRouting');
  const helperEnd = source.indexOf('\n}', helperStart) + 2;
  const helper = source.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0);
  assert.doesNotMatch(helper, /message:\s*input\./);
  assert.match(helper, /context:\s*\{\s*source:\s*"whatsapp",\s*mode:\s*"SHADOW"\s*\}/);
});
