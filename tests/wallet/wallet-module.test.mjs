import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'features/wallet/WalletModule.tsx',
  'features/wallet/routes.tsx',
  'features/wallet/hooks/useWalletAccess.ts',
  'features/wallet/hooks/useWalletRealtime.ts',
  'features/wallet/services/walletRepository.ts',
  'features/wallet/pages/WalletOverviewPage.tsx',
  'features/wallet/pages/WalletCardsPage.tsx',
  'features/wallet/pages/WalletAccountsPage.tsx',
  'features/wallet/pages/WalletPayablesPage.tsx',
  'features/wallet/pages/WalletIncomePage.tsx',
  'features/wallet/pages/WalletChargePage.tsx',
  'components/wallet/AccountCardStack.tsx',
];

test('WalletModule possui limites arquiteturais e subpaginas navegaveis', () => {
  for (const file of files) assert.equal(existsSync(file), true, `${file} deve existir`);
  const routes = readFileSync('features/wallet/routes.tsx', 'utf8');
  for (const path of ['visao-geral', 'cartoes', 'contas', 'dividas', 'receitas', 'cobranca']) {
    assert.match(routes, new RegExp(path));
  }
});

test('acesso modular e realtime possuem estados e cleanup deterministico', () => {
  const access = readFileSync('features/wallet/hooks/useWalletAccess.ts', 'utf8');
  const repository = readFileSync('features/wallet/services/walletRepository.ts', 'utf8');
  const realtime = readFileSync('features/wallet/hooks/useWalletRealtime.ts', 'utf8');
  assert.match(access, /loading/);
  assert.match(access, /inactive/);
  assert.match(access, /error/);
  assert.match(access, /auth\.getUser/);
  assert.match(repository, /user_modulos/);
  assert.match(realtime, /removeChannel/);
  assert.match(realtime, /setTimeout/);
  assert.match(realtime, /personal_wallet_/);
  assert.doesNotMatch(realtime, /service_role/);
});

test('migration cria somente user_modulos e preserva o dominio canonico', () => {
  const migration = readFileSync('supabase/migrations/20261025173000_wallet_module_feature_flags_realtime.sql', 'utf8');
  assert.match(migration, /create table if not exists public\.user_modulos/i);
  assert.match(migration, /for select[\s\S]*to authenticated/i);
  assert.match(migration, /for insert[\s\S]*to authenticated/i);
  assert.match(migration, /for update[\s\S]*using[\s\S]*with check/i);
  assert.match(migration, /for delete[\s\S]*to authenticated/i);
  assert.match(migration, /idx_user_modulos_lookup/i);
  assert.match(migration, /on conflict \(user_id, modulo_chave\) do nothing/i);
  assert.match(migration, /supabase_realtime/i);
  assert.doesNotMatch(migration, /create table(?: if not exists)? public\.(?:contas|cartoes|receitas_recorrentes|dividas_pagar)\b/i);
});

test('App integra o modulo sem manter a pagina legada como raiz', () => {
  const app = readFileSync('App.tsx', 'utf8');
  assert.match(app, /WalletModule/);
  assert.doesNotMatch(app, /const PersonalWalletPage = lazy/);
});
