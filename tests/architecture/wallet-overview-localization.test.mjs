import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const overview = readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
const summary = readFileSync('features/wallet/components/WalletOverviewSummary.tsx','utf8');
const stack = readFileSync('components/wallet/AccountCardStack.tsx','utf8');
const helper = readFileSync('components/wallet/walletPresentation.ts','utf8');
test('account type is localized throughout overview and bank stack',()=>{
 assert.match(helper,/CHECKING: 'Conta corrente'/);
 assert.match(helper,/PAYMENT: 'Conta de pagamento'/);
 assert.match(summary,/<AccountCardStack compact/);
 assert.match(stack,/walletAccountTypeLabel\(account.account_type\)/);
 assert.doesNotMatch(overview,/\{account.account_type \|\|/);
});
test('overview renders compact card rows beside credit summary and keeps detail navigation',()=>{
 assert.match(summary,/aria-label="Seus cartões"/);
 assert.match(summary,/cards\.slice\(0,4\)\.map\(card =>/);
 assert.match(summary,/card.primary_color \|\| visual.accent/);
 assert.match(summary,/card.last_four/);
 assert.match(summary,/onNavigate\('cartoes'\)/);
 assert.match(summary,/getCardSummaryDestination\(card.id\)/);
 assert.doesNotMatch(overview,/<BankStack/);
});
