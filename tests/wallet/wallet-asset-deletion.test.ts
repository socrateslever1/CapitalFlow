import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('services/personalWallet.service.ts', 'utf8');
const accountDetails = readFileSync('components/wallet/AccountDetailsPage.tsx', 'utf8');
const cardEditor = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');
const migrations = readdirSync('supabase/migrations')
  .filter(file => file.endsWith('.sql'))
  .map(file => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n');

test('contas e cartões oferecem arquivamento e exclusão como ações distintas', () => {
  assert.match(service, /async archiveAccount\(/);
  assert.match(service, /personal_wallet_archive_account/);
  assert.match(service, /async deleteAccount\(/);
  assert.match(service, /personal_wallet_delete_account/);
  assert.match(service, /async deleteCard\(/);
  assert.match(service, /personal_wallet_delete_card/);
  assert.match(accountDetails, /archiveAccount|Arquivar conta/);
  assert.match(accountDetails, /deleteAccount|Excluir conta/);
  assert.match(service, /async archiveCard\(/);
  assert.match(service, /personal_wallet_archive_card/);
  assert.match(cardEditor, /archiveCard|Arquivar cartão/);
  assert.match(cardEditor, /deleteCard|Excluir cartão/);
});

test('RPCs de arquivamento preservam o histórico e ocultam o ativo', () => {
  assert.match(migrations, /function public\.personal_wallet_archive_account\(/);
  assert.match(migrations, /function public\.personal_wallet_archive_card\(/);
  assert.match(migrations, /set archived_at = now\(\)/i);
  assert.match(migrations, /set status = 'CANCELED'/i);
});

test('RPCs de exclusão validam propriedade, saldo e dependências antes do delete', () => {
  assert.match(migrations, /function public\.personal_wallet_delete_account\(/);
  assert.match(migrations, /function public\.personal_wallet_delete_card\(/);
  assert.match(migrations, /owner_user_id = v_user/);
  assert.match(migrations, /for update/i);
  assert.match(migrations, /delete from public\.personal_wallet_accounts/);
  assert.match(migrations, /delete from public\.personal_wallet_cards/);
  assert.match(migrations, /NOTIFY pgrst, 'reload schema'/i);
});
