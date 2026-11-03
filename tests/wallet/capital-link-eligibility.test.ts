import test from 'node:test';
import assert from 'node:assert/strict';
import { getEligibleAccountCapitalSources } from '../../features/wallet/domain/capitalLink';
import type { CapitalSource } from '../../types';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';

const a = { id:'a', balance: 200, capital_source_id: null } as PersonalWalletAccount;
const source = (id:string,type:CapitalSource['type'],balance:number):CapitalSource =>
  ({ id, type, balance, profile_id:'owner', name:id });

test('associação respeita natureza e saldo de cada fonte',()=>{
  const options=getEligibleAccountCapitalSources(a,[a],[
    source('bank','BANK',200),
    source('card','CARD',200),
    source('mixed','MISTO',200),
    source('different','BANK',199.99),
  ]);
  assert.deepEqual(options.map(s=>s.id),['bank']);
});
