import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { bankDetailsDraft, normalizeBankDetails } from '../../features/wallet/domain/bankAccountDetails';

test('live bank_details migration is non-destructive, JSON-only, and retains existing rows', async () => {
  const database = new PGlite();
  try {
    await database.exec("create table personal_wallet_accounts(id uuid primary key, nickname text not null);");
    await database.exec("insert into personal_wallet_accounts values('00000000-0000-4000-8000-000000000001','Conta de teste');");
    const migration = readFileSync('supabase/migrations/20261030130657_wallet_accounts_optional_bank_details_jsonb.sql','utf8');
    await database.exec(migration);
    await database.exec(migration);
    const result = await database.query<{nickname:string;bank_details:Record<string,unknown>}>(
      'select nickname,bank_details from personal_wallet_accounts'
    );
    assert.deepEqual(result.rows,[{nickname:'Conta de teste',bank_details:{}}]);
    const columns = await database.query<{data_type:string;is_nullable:string}>(
      "select data_type,is_nullable from information_schema.columns where table_name='personal_wallet_accounts' and column_name='bank_details'"
    );
    assert.deepEqual(columns.rows,[{data_type:'jsonb',is_nullable:'NO'}]);
  } finally { await database.close(); }
});

test('bank details remain optional metadata and preserve leading zeros, no ledger changes', () => {
  const normalized=normalizeBankDetails({
    ...bankDetailsDraft(),holder_name:'Titular de teste',
    holder_document:'000.000.000-00',agency:'0001',account_number:'00001234',
  });
  assert.deepEqual(normalized,{
    holder_name:'Titular de teste',holder_document:'000.000.000-00',
    agency:'0001',account_number:'00001234',
  });
  const service=readFileSync('services/personalWallet.service.ts','utf8');
  const insert=service.slice(service.indexOf('  async createAccount('),service.indexOf('  async updateAccount('));
  assert(insert.includes("from('personal_wallet_accounts')"));
  assert(insert.includes('...input'));
  assert(insert.includes('balance: 0'));
  const update=service.slice(service.indexOf('  async updateAccount('),service.indexOf('  async archiveAccount(',service.indexOf('  async updateAccount(')));
  assert(update.includes('bank_details'));
  assert(!/balance:\s*Number\(/.test(update));
});

test('the same wallet FAB remains mounted on all five routes, including cards', () => {
  const wallet=readFileSync('features/wallet/WalletModule.tsx','utf8');
  const fab=readFileSync('features/wallet/components/WalletExpenseFab.tsx','utf8');
  assert(wallet.includes('<WalletExpenseFab />'));
  assert(!wallet.includes("route !== 'cartoes' && <WalletExpenseFab />"));
  assert(fab.includes("location.pathname.startsWith('/carteira/cartoes')"));
  assert(fab.includes('bottom-28'));
  assert(fab.includes('bottom-20'));
});

test('own profile is suggested and third party identity requires explicit input', () => {
  const card=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
  const account=readFileSync('components/wallet/CreateAccountModal.tsx','utf8');
  const hook=readFileSync('features/wallet/hooks/useWalletOwnerDefaults.ts','utf8');
  const accounts=readFileSync('features/wallet/pages/WalletAccountsPage.tsx','utf8');
  assert(card.includes('activeUser }) =>'));
  assert(card.includes('Cartão de outra pessoa'));
  assert(card.includes('setThirdPartyCard'));
  assert(card.includes('ownerDefaults.name'));
  assert(card.includes('Informe o nome do titular do cartão de terceiros'));
  assert(account.includes('Conta de outra pessoa'));
  assert(account.includes('setThirdPartyAccount'));
  assert(account.includes('ownerDefaults.document'));
  assert(account.includes('Informe o titular da conta de terceiros'));
  assert(account.includes("parseWalletMoney(initialBalance.trim() || '0'"));
  assert(accounts.includes('activeUser={activeUser}'));
  assert(hook.includes("from('profiles').select('full_name')"));
  assert(hook.includes("supabase.auth.getUser()"));
  assert(!hook.includes("supabase.auth.admin"));
  assert(!/pix_key:\s*ownerDefaults.document/.test(card + account));
  assert(account.includes('providedCapitalSources !== undefined'));
});
