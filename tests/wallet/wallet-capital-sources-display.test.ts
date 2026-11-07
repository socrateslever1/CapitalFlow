import assert from 'node:assert/strict';
import test from 'node:test';
import { describeWalletBalanceFact, buildWalletBalanceFacts } from '../../components/wallet/walletBalanceDomain';
import { getAccountCapitalSourceChoices, getEligibleAccountCapitalSources } from '../../features/wallet/domain/capitalLink';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import type { CapitalSource } from '../../types';

const account = { id: 'account-1', balance: 200, capital_source_id: null } as PersonalWalletAccount;
const source = (id: string, type: CapitalSource['type'], balance: number): CapitalSource =>
  ({ id, name: id, type, balance, profile_id: 'owner' } as CapitalSource);

test('todas as fontes ativas recebidas são visíveis, mesmo que nem todas sejam vinculáveis', () => {
  const other = { id: 'account-2', balance: 200, capital_source_id: 'in-use' } as PersonalWalletAccount;
  const sources = [source('ok','BANK',200),source('card','CARD',200),
    source('mixed','MISTO',200),source('in-use','BANK',200),
    source('different','BANK',199.99)];
  const options = getAccountCapitalSourceChoices(account, [account, other], sources);
  assert.deepEqual(options.map(item => item.source.id), sources.map(item => item.id));
  assert.deepEqual(options.filter(item => item.selectable).map(item => item.source.id), ['ok']);
  assert.deepEqual(options.filter(item => !item.selectable).map(item => item.reason), [
    'fonte de crédito ou mista', 'fonte de crédito ou mista',
    'vinculada a outra conta', 'saldos diferentes',
  ]);
  assert.deepEqual(getEligibleAccountCapitalSources(account,[account,other],sources).map(item => item.id),['ok']);
});

test('fonte anteriormente vinculada continua visível para desvinculação segura', () => {
  const old = { ...account, capital_source_id: 'card' };
  const list = getAccountCapitalSourceChoices(old,[old],[source('card','CARD',199)]);
  assert.equal(list[0].selectable,true);
});

test('estado e origem financeira são apresentados em português, sem alterar os códigos', () => {
  const facts = buildWalletBalanceFacts({ effectiveBalance: 0, importedBalance: null });
  assert.equal(describeWalletBalanceFact(facts.effective),'Efetivo · Registro financeiro');
  assert.equal(facts.effective.state,'EFFECTIVE');
  assert.equal(describeWalletBalanceFact(facts.imported),'Não informado · Origem não informada');
});
