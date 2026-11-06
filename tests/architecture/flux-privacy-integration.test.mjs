import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(path, 'utf8');

test('o olho controla a ocultação da carteira através de um provedor React compartilhado', () => {
  const shell = file('layout/AppShell.tsx');
  assert.match(shell, /FinancialPrivacyProvider hidden=\{isStealthMode\}/);
  for (const path of [
    'components/wallet/BankStack.tsx',
    'components/wallet/AccountCardStack.tsx',
    'features/wallet/components/WalletOverviewSummary.tsx',
    'features/wallet/components/WalletBalanceDock.tsx',
    'features/wallet/pages/WalletOverviewPage.tsx',
    'features/wallet/pages/WalletCardsPage.tsx',
    'features/wallet/pages/WalletIncomePage.tsx',
    'features/wallet/pages/WalletAccountsPage.tsx',
    'components/wallet/CardInvoiceStatement.tsx',
    'components/wallet/AccountDetailsPage.tsx',
  ]) {
    assert.match(file(path), /PrivateMoney|useFinancialPrivacy/, path);
    assert.doesNotMatch(file(path), /\$<PrivateMoney/, path + ' contém interpolação incorreta');
  }
  assert.match(file('components/wallet/WalletMetricStrip.tsx'), /useFinancialPrivacy/);
});

test('Flux aceita origem do APK, usa alternância real e mantém autorização por JWT', () => {
  const source = file('supabase/functions/ai-assistant/index.ts');
  assert.match(source, /'https:\/\/localhost'/);
  assert.match(source, /'capacitor:\/\/localhost'/);
  assert.match(source, /GROQ_API_KEY/);
  assert.match(source, /OPENROUTER_API_KEY/);
  assert.match(source, /gemini-3\.5-flash-lite/);
  assert.match(source, /providerCoolingUntil/);
  assert.match(source, /Deno\.env\.get\(provider\.secretEnv\)/);
  assert.match(source, /is_platform_super_admin/);
  assert.match(source, /client\.auth\.getUser\(token\)/);
  assert.doesNotMatch(source, /SERVICE_ROLE_KEY/);
});
