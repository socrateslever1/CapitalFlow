import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChargeLink, getBankVisual, getCreditSummary, groupWalletByBank } from '../../components/wallet/walletPresentation';

test('usa identidade conhecida e fallback estável sem imagem externa', () => {
  assert.equal(getBankVisual('Nubank').accent, '#820ad1');
  assert.equal(getBankVisual('RecargaPay').accent, '#0ea5e9');
  assert.equal(getBankVisual('Banco Inventado').accent, getBankVisual('Banco Inventado').accent);
  assert.match(getBankVisual('Banco Inventado').monogram, /^[A-Z]{1,2}$/);
});

test('normaliza aliases comerciais na mesma instituição', () => {
  assert.equal(getBankVisual('Nu').key, 'nubank');
  assert.equal(getBankVisual('Nu Pagamentos').key, 'nubank');
  assert.equal(getBankVisual('Recarga Pay').key, 'recargapay');
  const groups = groupWalletByBank(
    [{ id: 'a1', nickname: 'Principal', bank_name: 'Nubank', balance: 10 }],
    [{ id: 'c1', nickname: 'Roxo', issuer: 'Nu', account_id: null }],
  );
  assert.equal(groups.length, 1);
});

test('consolida limite utilizado e disponível sem percentuais inválidos', () => {
  assert.deepEqual(getCreditSummary([
    { credit_limit: 1000, used_limit: 250 },
    { credit_limit: 0, used_limit: 0 },
  ]), { total: 1000, used: 250, available: 750, percentage: 25 });
  assert.equal(getCreditSummary([{ credit_limit: 0, used_limit: 10 }]).percentage, 0);
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
  const link = buildChargeLink('https://capitalflow.app/carteira', { pixKey: 'a@b.com', recipient: 'Ana Silva', amount: 12.5, description: 'Pedido 42' });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get('pix'), 'a@b.com');
  assert.equal(parsed.searchParams.get('recebedor'), 'Ana Silva');
  assert.equal(parsed.searchParams.get('valor'), '12.50');
  assert.equal(parsed.searchParams.get('descricao'), 'Pedido 42');
});
