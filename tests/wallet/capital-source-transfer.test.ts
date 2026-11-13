import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapitalSource } from '../../types';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import {
  canMoveCapitalSource, getMovableCapitalTotal, validateCapitalMovement,
} from '../../features/wallet/domain/capitalSourceTransfer';

const source = (id: string, balance: number, type: CapitalSource['type'] = 'WALLET'): CapitalSource =>
  ({ id, name: id, balance, type, profile_id: 'my-profile' });
const account = (id: string, capSource: string | null = null): PersonalWalletAccount =>
  ({ id, nickname: id, bank_name: null, account_type: 'CHECKING', balance: 0, capital_source_id: capSource });

test('somente saldos positivos não-card e não espelhados são transferíveis', () => {
  const sources = [
    source('C6', 2000),
    source('Caixa Livre', 1500, 'CAIXA'),
    source('Carteira Principal', 400, 'CASH'),
    source('Empréstimo', 350, 'BANK'),
    source('Nu', 0, 'CARD'),
    source('PicPay', 150, 'MISTO'),
    source('Teste', -1, 'BANK'),
    source('Espelho', 1200, 'BANK'),
  ];
  const accounts = [account('Nubank', 'Espelho'),account('RecargaPay')];
  assert.equal(getMovableCapitalTotal(sources, accounts), 4250);
  assert.equal(canMoveCapitalSource(sources[7], accounts), false);
  assert.equal(canMoveCapitalSource(sources[5], accounts), false);
  assert.equal(canMoveCapitalSource(sources[6], accounts), false);
});

test('bloqueia valores inválidos, destino ausente, fonte espelho e excedente', () => {
  const c6 = source('C6', 2000);
  const recarga = account('RecargaPay');
  const accounts = [recarga, account('Nubank', 'C6')];
  assert.match(validateCapitalMovement(200,c6,recarga,accounts) || '', /fonte/i);
  const allowed = [recarga];
  assert.equal(validateCapitalMovement(200,c6,recarga,allowed),null);
  assert.match(validateCapitalMovement(0,c6,recarga,allowed) || '', /valor/i);
  assert.match(validateCapitalMovement(2000.01,c6,recarga,allowed) || '', /excede/i);
  assert.match(validateCapitalMovement(Number.NaN,c6,recarga,allowed) || '', /valor/i);
  assert.match(validateCapitalMovement(200.001,c6,recarga,allowed) || '', /valor/i);
  assert.match(validateCapitalMovement(100,c6,undefined,allowed) || '', /conta/i);
  assert.match(validateCapitalMovement(100,c6,{...recarga,archived_at:'2026-01-01'},allowed) || '', /conta/i);
});
