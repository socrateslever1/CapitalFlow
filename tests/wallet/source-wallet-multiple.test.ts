import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getSourceWalletAvailability, type WalletReference } from '../../domain/sources/sourceWalletReference';

const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const source = { balance: 500 };
test('fonte pode ter simultaneamente conta e cartão com montantes de referência independentes', () => {
  const refs: WalletReference[] = [
    { source_id: ids[0], target_kind:'ACCOUNT',target_id:ids[0],allocated_amount:200 },
    { source_id: ids[0], target_kind:'CARD',target_id:ids[1],allocated_amount:150 },
  ];
  assert.equal(refs.length,2);
  const accounts=[{ id:ids[0],nickname:'Conta',balance:900,capital_source_id:null }];
  const cards=[{ id:ids[1],nickname:'Cartão',status:'ACTIVE',available_limit:1005.92 }];
  assert.equal(getSourceWalletAvailability(source,refs[0],accounts,cards).amount,900);
  assert.equal(getSourceWalletAvailability(source,refs[1],accounts,cards).amount,1005.92);
  assert.equal(refs.reduce((sum,ref)=>sum+(ref.allocated_amount || 0),0),350);
  assert.equal(source.balance,500,'nunca altera saldo operacional');
});

test('substituição das origens é atômica e com verificação da identidade', () => {
  const sql=readFileSync('supabase/migrations/20261105141000_capital_source_wallet_multi_origins.sql','utf8');
  assert.match(sql,/primary key \(source_id, target_kind, target_id\)/);
  assert.match(sql,/p_origins jsonb/);
  assert.match(sql,/jsonb_array_elements\(p_origins\)/);
  assert.match(sql,/delete from public\.capital_source_wallet_references/);
  assert.match(sql,/insert into public\.capital_source_wallet_references/);
  assert.match(sql,/can_manage_capital_source_wallet_origins\(\)/);
  assert.match(sql,/a\.owner_user_id=v_uid/);
  assert.match(sql,/c\.owner_user_id=v_uid/);
  assert.doesNotMatch(sql,/\bupdate public\.fontes set balance\b/i);
  assert.doesNotMatch(sql,/\bupdate public\.personal_wallet_accounts set balance\b/i);
});

test('editor permite várias seleções e preserva confirmação explícita', () => {
  const ui=readFileSync('components/sources/SourceWalletReferencePanel.tsx','utf8');
  assert.match(ui,/type="checkbox"/);
  assert.match(ui,/selectedKeys\.length/);
  assert.match(ui,/capital_source_replace_wallet_origins/);
  assert.match(ui,/Salvar origens/);
  assert.match(ui,/can_manage_capital_source_wallet_origins/);
  assert.match(ui,/allocated_amount/);
  assert.doesNotMatch(ui,/\.from\('fontes'\)\.update/);
});
