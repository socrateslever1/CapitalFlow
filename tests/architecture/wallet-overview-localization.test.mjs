import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
const stack = readFileSync('components/wallet/AccountCardStack.tsx','utf8');
const helper = readFileSync('components/wallet/walletPresentation.ts','utf8');
test('account type is localized throughout overview and bank stack',()=>{
 assert.match(helper,/CHECKING: 'Conta corrente'/);
 assert.match(helper,/PAYMENT: 'Conta de pagamento'/);
 assert.match(overview,/walletAccountTypeLabel\(account.account_type\)/);
 assert.match(stack,/walletAccountTypeLabel\(account.account_type\)/);
 assert.doesNotMatch(overview,/\{account.account_type \|\|/);
});
test('overview renders compact physical cards beside credit summary',()=>{
 assert.match(overview,/aria-label="Seus cartões"/);
 assert.match(overview,/cards\.map\(card =>/);
 assert.match(overview,/card.primary_color \|\| visual.accent/);
 assert.match(overview,/card.last_four/);
 assert.match(overview,/go\('cartoes'\)/);
 assert.doesNotMatch(overview,/<BankStack/);
});
