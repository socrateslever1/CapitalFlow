import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCapitalLinkState } from '../../features/wallet/domain/capitalLink';
import type { CapitalSource } from '../../types';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';

const account: PersonalWalletAccount = {id:'a',nickname:'Conta',account_type:'CHECKING',bank_name:'Banco',balance:100};
const source = {id:'s',name:'Capital',balance:100} as CapitalSource;
test('capital status distinguishes optional links, unavailable sources and divergent funds without mutating them', () => {
  assert.equal(getCapitalLinkState(account,[source]).status,'unlinked');
  const linked={...account,capital_source_id:'s'};
  assert.equal(getCapitalLinkState(linked,[]).status,'unavailable');
  assert.equal(getCapitalLinkState(linked,[source]).status,'linked');
  assert.equal(getCapitalLinkState(linked,[{...source,balance:100.01}]).status,'divergent');
  assert.equal(getCapitalLinkState({...linked,balance:NaN},[source]).status,'divergent');
  assert.equal(account.balance,100); assert.equal(source.balance,100);
});
