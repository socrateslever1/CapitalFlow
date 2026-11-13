import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file,'utf8');
const sql = read('supabase/migrations/20261113061000_capital_source_to_wallet_transfer.sql');

test('RPC de capital é idempotente, transacional, autorizada e exclui crédito de cartão', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.capital_source_wallet_transfers/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.capital_source_wallet_transfers FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /NOT public\.is_platform_super_admin\(\)/);
  assert.match(sql, /p\.user_id=v_owner/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /v_old\.amount IS DISTINCT FROM v_amount/);
  assert.match(sql, /v_source\.balance < v_amount/);
  assert.match(sql, /v_source\.type IN \('CARD','MISTO'\)/);
  assert.match(sql, /personal_wallet_reset_archives/);
  assert.match(sql, /v_account\.capital_source_id=p_source_id/);
  assert.match(sql, /capital_source_wallet_references/);
  assert.match(sql, /UPDATE public\.fontes/);
  assert.match(sql, /UPDATE public\.personal_wallet_accounts/);
  assert.match(sql, /'CAPITAL_TRANSFER'/);
  assert.doesNotMatch(sql, /DELETE FROM public\.(fontes|contratos|financial_operations)/i);
});

test('frontend abre modal em Fontes e Contas somente com autorização real de master', () => {
  const accounts=read('features/wallet/pages/WalletAccountsPage.tsx');
  const sources=read('pages/SourcesPage.tsx');
  const card=read('components/cards/SourceCard.tsx');
  const modal=read('features/wallet/components/CapitalSourceTransferModal.tsx');
  const service=read('services/personalWallet.service.ts');
  assert.match(accounts, /platformAdminService\.isSuperAdmin\(\)/);
  assert.match(sources, /platformAdminService\.isSuperAdmin\(\)/);
  assert.match(accounts, /CapitalSourceTransferModal/);
  assert.match(sources, /onTransferToAccount=/);
  assert.match(card, /Transferir para conta/);
  assert.match(modal, /não envia Pix nem transfere dinheiro no banco/);
  assert.match(modal, /requestId\.current/);
  assert.match(service, /supabase\.rpc\('capital_source_transfer_to_wallet'/);
  assert.match(accounts, /getMovableCapitalTotal/);
  assert.doesNotMatch(accounts, /Adicionar carteira física/);
});

test('a interface distingue movimentação de Capital de receita bancária', () => {
  const statement=read('components/wallet/accountStatementDomain.ts');
  const income=read('features/wallet/domain/walletIncomeHistory.ts');
  assert.match(statement, /operation\.operation_type === 'CAPITAL_TRANSFER'/);
  assert.match(statement, /Transferência do Capital/);
  assert.match(income, /op\.operation_type !== 'INCOME'/);
});

test('campos de financiamento não forçam três colunas estreitas no modal', () => {
  const fields=read('components/forms/LoanFundingCostFields.tsx');
  assert.match(fields, /repeat\(auto-fit, minmax\(min\(100%, 13rem\), 1fr\)\)/);
  assert.match(fields, /min-h-11 items-end/);
  assert.doesNotMatch(fields, /grid gap-3 sm:grid-cols-3/);
});
