import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modalSource = readFileSync('components/ui/Modal.tsx', 'utf8');
const activitySource = readFileSync('components/wallet/AccountActivityPanel.tsx', 'utf8');
const detailsSource = readFileSync('components/wallet/AccountDetailsPage.tsx', 'utf8');
const cardsSource = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');

test('Modal preserva variante padrão e adiciona variante wallet com margem, safe-area e visualViewport', () => {
  assert.match(modalSource, /variant\?: 'default' \| 'wallet'/);
  assert.match(modalSource, /variant = 'default'/);
  assert.match(modalSource, /window\.visualViewport/);
  assert.match(modalSource, /safe-area-inset-top/);
  assert.match(modalSource, /safe-area-inset-bottom/);
  assert.match(modalSource, /registerDialogBack\(back\)/);
  assert.match(modalSource, /overflow-y-auto overscroll-contain/);
});

test('Conta usa janelas suspensas para Receita, Receber, Despesa, Pagar, Transferir, Saldo inicial e exclusão de lançamento', () => {
  for (const label of ['Receita', 'Receber', 'Despesa', 'Pagar', 'Transferir']) {
    assert.match(activitySource, new RegExp(`'${label}'`));
  }
  assert.match(activitySource, /Saldo inicial/);
  assert.match(activitySource, /<Modal[\s\S]*variant="wallet"[\s\S]*title=\{labels\[action\]\}/);
  assert.match(activitySource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Saldo inicial auditável"/);
  assert.match(activitySource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Excluir lançamento"/);
  assert.doesNotMatch(activitySource, /window\.confirm/);
  assert.match(activitySource, /requestId:transactionRef\.current\.id/);
  assert.match(activitySource, /requestId:openingRef\.current\.id/);
  assert.match(activitySource, /Exportar CSV/);
});

test('Detalhe da conta usa janelas suspensas para Editar, Arquivar, Excluir e Reajustar saldo', () => {
  assert.match(detailsSource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Reajustar saldo da conta"/);
  assert.match(detailsSource, /<Modal[\s\S]*variant="wallet"[\s\S]*title=\{`Arquivar \$\{account\.nickname\}\?`\}/);
  assert.match(detailsSource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Excluir esta conta\?"/);
  assert.match(detailsSource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Editar dados da conta"/);
  assert.match(detailsSource, /Voltar/);
  assert.match(detailsSource, /Copiar PIX/);
  assert.match(detailsSource, /Gerar cobrança/);
});

test('Cartões mantém fluxos em janelas e move importação de extrato/fatura para Modal variant wallet', () => {
  assert.match(cardsSource, /<Modal[\s\S]*variant="wallet"[\s\S]*title="Importar extrato ou fatura"/);
  assert.match(cardsSource, /<FlatSmartStatementReader/);
  assert.match(cardsSource, /<CardEditModal/);
  assert.match(cardsSource, /<PayInvoiceModal/);
  assert.match(cardsSource, /<InvoiceOverrideModal/);
  assert.match(cardsSource, /<CardVaultModal/);
  assert.match(cardsSource, /<CardInitialBalancesModal/);
});
