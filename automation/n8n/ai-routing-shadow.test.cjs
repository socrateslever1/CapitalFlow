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

test('shadow reconhece rentabilidade e bloqueia prompt injection', () => {
  assert.match(source, /consultar_rentabilidade/);
  assert.match(source, /ignore\|desconsidere\|esqueca/);
  assert.match(source, /route:\s*"UNKNOWN",\s*confidence:\s*0\.99/);
});

test('shadow mantém conversas comuns fora das Skills financeiras', () => {
  assert.match(source, /"CONVERSATION"/);
  assert.match(source, /intent:\s*"greeting",\s*route:\s*"CONVERSATION"/);
  assert.match(source, /intent:\s*"payment_link_request",\s*route:\s*"CONVERSATION"/);
  assert.match(source, /intent:\s*"identify_client",\s*route:\s*"CONVERSATION"/);
});

test('shadow encaminha divergência de valor e reconhece pagamento recebido', () => {
  assert.match(source, /intent:\s*"dispute_amount",\s*route:\s*"HUMAN_HANDOFF"/);
  assert.match(source, /recebi\|recebemos/);
});

test('solicitação de empréstimo sempre cria handoff sem aprovar crédito', () => {
  const start = source.indexOf('if (action === "loan_interest")');
  const end = source.indexOf('if (action === "human_handoff")', start);
  const branch = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(branch, /n8n_loan_leads/);
  assert.match(branch, /n8n_handoffs/);
  assert.match(branch, /HUMAN_HANDOFF/);
  assert.doesNotMatch(branch, /process_financial_operation_v4|aprova/i);
});
