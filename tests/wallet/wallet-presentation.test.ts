import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChargeLink, getBankVisual, groupWalletByBank } from '../../components/wallet/walletPresentation';

test('usa identidade conhecida e fallback estável sem imagem externa', () => {
  assert.equal(getBankVisual('Nubank').accent, '#820ad1');
  assert.equal(getBankVisual('Banco Inventado').accent, getBankVisual('Banco Inventado').accent);
  assert.match(getBankVisual('Banco Inventado').monogram, /^[A-Z]{1,2}$/);
});

test('agrupa cartão vinculado na conta e mantém cartão independente', () => {
  const groups = groupWalletByBank(
    [{ id: 'a1', nickname: 'Principal', bank_name: 'Nubank', balance: 10 }],
    [{ id: 'c1', nickname: 'Roxo', issuer: 'Nubank', account_id: 'a1' }, { id: 'c2', nickname: 'Loja', issuer: 'XP', account_id: null }],
  );
  assert.equal(groups.find(group => group.key === 'nubank')?.cards.length, 1);
  assert.equal(groups.find(group => group.key === 'xp')?.cards.length, 1);
});

test('link de cobrança preserva somente os dados necessários', () => {
  const link = buildChargeLink('https://capitalflow.app/carteira', { pixKey: 'a@b.com', recipient: 'Ana Silva', amount: 12.5 });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get('pix'), 'a@b.com');
  assert.equal(parsed.searchParams.get('recebedor'), 'Ana Silva');
  assert.equal(parsed.searchParams.get('valor'), '12.50');
});
