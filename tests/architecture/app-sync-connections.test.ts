import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APP_SYNC_EVENTS } from '../../utils/appSyncEvents';

test('eventos de sincronização entre páginas e funções têm nomes canônicos', () => {
  assert.equal(APP_SYNC_EVENTS.WALLET_UPDATED, 'capitalflow:wallet-updated');
  assert.equal(APP_SYNC_EVENTS.CAPITAL_SYNC_REQUESTED, 'capitalflow:sync-requested');
  assert.equal(APP_SYNC_EVENTS.SOURCE_ORIGINS_UPDATED, 'capitalflow:source-origins-updated');
});

test('emissão de contrato, aporte, transferência e operações da Carteira propagam sincronização entre páginas', () => {
  const loanController = readFileSync('hooks/controllers/useLoanController.ts', 'utf8');
  const aporteModal = readFileSync('components/modals/NewAporteModal.tsx', 'utf8');
  const transferModal = readFileSync('features/wallet/components/CapitalSourceTransferModal.tsx', 'utf8');
  const sourceRefPanel = readFileSync('components/sources/SourceWalletReferencePanel.tsx', 'utf8');
  const quickExpense = readFileSync('components/wallet/QuickExpenseModal.tsx', 'utf8');
  const quickIncome = readFileSync('features/wallet/components/QuickIncomeModal.tsx', 'utf8');
  const activityPanel = readFileSync('components/wallet/AccountActivityPanel.tsx', 'utf8');
  const movementModal = readFileSync('components/wallet/AccountMovementModal.tsx', 'utf8');
  const cardEdit = readFileSync('components/wallet/CardEditModal.tsx', 'utf8');

  assert.match(loanController, /notifyWalletUpdated\(\)/);
  assert.match(aporteModal, /notifyFinancialDataChanged\(\{\s*wallet:\s*true,\s*capital:\s*true\s*\}\)/);
  assert.match(transferModal, /notifyFinancialDataChanged\(\{\s*wallet:\s*true,\s*capital:\s*true,\s*sourceOrigins:\s*true\s*\}\)/);
  assert.match(sourceRefPanel, /capitalflow:wallet-updated/);
  assert.match(quickExpense, /notifyFinancialDataChanged/);
  assert.match(quickIncome, /notifyFinancialDataChanged/);
  assert.match(activityPanel, /notifyFinancialDataChanged/);
  assert.match(movementModal, /notifyFinancialDataChanged/);
  assert.match(cardEdit, /notifyFinancialDataChanged/);
});
