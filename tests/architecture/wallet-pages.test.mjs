import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read=path=>readFileSync(path,'utf8');
const names=['WalletCardsPage','WalletAccountsPage','WalletPayablesPage','WalletIncomePage'];
test('physical pages no longer render the legacy wallet monolith',()=>{
 for(const name of names){
  const src=read('features/wallet/pages/'+name+'.tsx');
  assert.doesNotMatch(src,/PersonalWalletPage/);
  assert.match(src,/useWalletSnapshot/);
  assert.match(src,/WalletPageFrame/);
 }
});
test('pages use canonical RPC service, not direct financial mutations',()=>{
 const card=read('features/wallet/pages/WalletCardsPage.tsx');
 const debt=read('features/wallet/pages/WalletPayablesPage.tsx');
 assert.match(card,/payInvoicePartial/);
 assert.match(card,/createCardWithOpening/);
 assert.match(debt,/payPayable/);
 for(const name of names) assert.doesNotMatch(read('features/wallet/pages/'+name+'.tsx'),/\.from\(['"]personal_wallet_/);
});
test('realtime correctly scopes income owner field',()=>{
 const src=read('features/wallet/hooks/useWalletRealtime.ts');
 assert.match(src,/personal_wallet_recurring_incomes/);
 assert.match(src,/personal_wallet_recurring_receipts/);
 assert.match(src,/\? 'user_id' : 'owner_user_id'/);
 assert.match(src,/removeChannel/);
});
test('module access remains admin-controlled',()=>{
 const sql=read('supabase/migrations/20261025201500_wallet_module_entitlements_hardening.sql');
 assert.match(sql,/REVOKE INSERT,UPDATE,DELETE ON public.user_modulos FROM authenticated/);
});

test('token refresh must not restart the full application bootstrap', () => {
 const src = read('features/auth/useAuth.ts');
 const eventCase = src.slice(src.indexOf("if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED')"));
 assert.ok(eventCase.includes("ev === 'SIGNED_IN' && session?.user && !readLocalProfileId()"));
 assert.doesNotMatch(eventCase.slice(0,eventCase.indexOf("window.dispatchEvent(new Event('cm_auth_restored'))")),/if\s*\(session\?\.user\)\s*\{[\s\S]*?boot\(\)/);
});

test('accounts emphasize institution balances without misrepresenting credit', () => {
 const stack = read('components/wallet/AccountCardStack.tsx');
 assert.match(stack,/Saldo disponível/);
 assert.match(stack,/Saldo consolidado/);
 assert.match(stack,/BankLogo/);
 assert.match(stack,/account\.id/);
 assert.doesNotMatch(stack,/Limite disponível/);
});
