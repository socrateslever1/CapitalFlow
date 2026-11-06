import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');

test('Flux panel does not cover the wallet with proactive bubble or eager reads', () => {
  const ui = read('components/ai/MasterMascot.tsx');
  assert.doesNotMatch(ui, /bubbleText|bottom-14 left-0 mb-2 max-w-\[15rem\]/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /min\(25rem,calc\(100vw-1\.5rem\)\)/);
  assert.match(ui, /turns: turnsAtRequest/);
  assert.match(ui, /const requestAlerts = async/);
  assert.match(ui, /onClick=\{\(\) => void requestAlerts\(\)\}/);
});
test('transport fallback never loads all finance tables or silently invents a number', () => {
  const service = read('services/aiAssistant.service.ts');
  assert.match(service, /supabase\.functions\.invoke/);
  assert.doesNotMatch(service, /personalWalletService\.load\(|supabase\.from\('contratos'\)/);
  assert.match(service, /Nenhuma consulta financeira adicional foi iniciada/);
});
test('read-only agent has bounded financial access and supports provider failover with history', () => {
  const edge = read('supabase/functions/ai-assistant/index.ts');
  const core = read('supabase/functions/ai-assistant/core.ts');
  assert.match(edge, /normalizeAssistantTurns\(body\.turns\)/);
  assert.match(edge, /consultar_dados_financeiros/);
  assert.match(edge, /providerCoolingUntil/);
  assert.match(edge, /CACHE_TTL_MS = 12_000/);
  assert.match(edge, /FINANCIAL_CONTEXT_UNAVAILABLE/);
  assert.match(edge, /is_platform_super_admin/);
  assert.match(edge, /client\.auth\.getUser\(token\)/);
  assert.doesNotMatch(edge, /client\.from\('ai_assistant_requests'\)\.insert/);
  assert.doesNotMatch(edge, /supabase\.rpc\('personal_wallet_pay_invoice|personal_wallet_create_expense/);
  assert.match(core, /allowedFinancialArea/);
  assert.match(core, /slice\(-12\)/);
});
