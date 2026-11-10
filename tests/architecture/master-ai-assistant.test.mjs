import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('master mascot is gated by platform super admin and never mutates the ledger', () => {
  const functionSource = read('supabase/functions/ai-assistant/index.ts');
  const componentSource = read('components/ai/MasterMascot.tsx');
  const migration = read('supabase/migrations/20261105235900_master_ai_assistant.sql');
  const writeMigration = read('supabase/migrations/20261106100000_master_ai_assistant_write_policy.sql');
  const authFkMigration = read('supabase/migrations/20261106101500_master_ai_assistant_auth_fk.sql');

  assert.match(functionSource, /is_platform_super_admin/);
  assert.match(functionSource, /permissionMode === 'CONFIRM'/);
  assert.match(functionSource, /Não execute mutações financeiras/);
  assert.match(functionSource, /AI_PROVIDER_POOL_JSON/);
  assert.doesNotMatch(functionSource, /generationConfig: \{ temperature:/);
  assert.match(functionSource, /https:\/\/capitalflow\.app/);
  assert.match(functionSource, /allowedOrigins/);
  assert.match(functionSource, /action === 'history'/);
  assert.match(functionSource, /action === 'briefing'/);
  assert.match(functionSource, /buildBriefing/);
  assert.match(functionSource, /ai_assistant_requests/);
  assert.match(componentSource, /!authorized/);
  assert.match(componentSource, /isMasterAssistantEnabled/);
  assert.match(componentSource, /loadMasterAssistantHistory/);
  assert.match(componentSource, /loadMasterAssistantBriefing/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /ai_assistant_requests_master_read/);
  assert.match(writeMigration, /master_insert/);
  assert.match(writeMigration, /master_update/);
  assert.match(writeMigration, /grant select, insert, update/);
  assert.match(authFkMigration, /references auth\.users\(id\)/);
  assert.doesNotMatch(functionSource, /personal_wallet_create_expense|personal_wallet_pay_invoice|financial_operations/);
});
