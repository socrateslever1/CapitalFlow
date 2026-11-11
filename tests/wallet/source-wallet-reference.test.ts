import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeWalletReference, encodeWalletReference, getSourceWalletAvailability } from '../../domain/sources/sourceWalletReference';

const id = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';
const source = { balance: 700 };
const account = { id, nickname: 'Banco A', balance: 900, capital_source_id: null };
const card = { id: id2, nickname: 'Cartão B', available_limit: 400, status: 'ACTIVE' };

test('fonte é autônoma por padrão sem vínculo implícito', () => {
  assert.deepEqual(getSourceWalletAvailability(source, null, [account], [card]), {
    kind: 'MANUAL', amount: 700, label: 'Valor informado na fonte', differs: false,
  });
});

test('conta e cartão informam disponibilidade sem alterar saldo operacional da fonte', () => {
  const fromAccount = getSourceWalletAvailability(source, {
    source_id: id2, target_kind: 'ACCOUNT', target_id: id,
  }, [account], [card]);
  assert.equal(fromAccount.kind, 'ACCOUNT');
  assert.equal(fromAccount.amount, 900);
  assert.equal(fromAccount.differs, true);
  assert.equal(source.balance, 700);
  const fromCard = getSourceWalletAvailability(source, {
    source_id: id, target_kind: 'CARD', target_id: id2,
  }, [account], [card]);
  assert.equal(fromCard.kind, 'CARD');
  assert.equal(fromCard.amount, 400);
  assert.equal(fromCard.label, 'Crédito disponível no cartão');
});

test('recurso ausente ou já integrado por sincronização é rejeitado', () => {
  const link = { source_id: id2, target_kind: 'ACCOUNT' as const, target_id: id };
  assert.equal(getSourceWalletAvailability(source, link, [], []).kind, 'UNAVAILABLE');
  assert.equal(getSourceWalletAvailability(source, link,
    [{ ...account, capital_source_id: id2 }], []).kind, 'UNAVAILABLE');
  assert.equal(getSourceWalletAvailability(source, { ...link, target_kind: 'CARD' }, [], []).kind, 'UNAVAILABLE');
});

test('seletor não aceita identificadores arbitrários', () => {
  assert.deepEqual(decodeWalletReference(encodeWalletReference('ACCOUNT', id)), { kind: 'ACCOUNT', id });
  assert.equal(decodeWalletReference('CARD:abc'), null);
  assert.equal(decodeWalletReference('__proto__:x'), null);
});

test('integração é apenas metadado e tem isolamento por proprietário no SQL', () => {
  const sql = readFileSync('supabase/migrations/20261105054345_capital_source_wallet_reference.sql','utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /owner_user_id\s*=\s*\(select auth\.uid\(\)\)/);
  assert.match(sql, /is_platform_super_admin\(\)/);
  assert.match(sql, /c\.owner_user_id = v_uid/);
  assert.match(sql, /a\.owner_user_id = v_uid/);
  assert.doesNotMatch(sql, /\bupdate public\.fontes set balance\b/i);
  assert.doesNotMatch(sql, /\bupdate public\.personal_wallet_accounts set balance\b/i);
  assert.doesNotMatch(sql, /\bupdate public\.personal_wallet_cards set\b/i);
});

test('painel distingue fontes de capital de cartões e mostra motivo da origem antiga', () => {
  const panel = readFileSync('components/sources/SourceWalletReferencePanel.tsx', 'utf8');
  assert.match(panel, /Fontes de capital do tipo cartão/);
  assert.match(panel, /Cartão antigo não localizado na Minha Carteira/);
  assert.match(panel, /Conta antiga não localizada na Minha Carteira/);
  assert.match(panel, /Vínculo antigo mantido/);
  assert.match(panel, /snapshot\.cards\.find/);
  assert.match(panel, /snapshot\.accounts\.find/);
  assert.match(panel, /if \(!availableKeys\.has\(key\)\)/);
});
