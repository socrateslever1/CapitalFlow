import assert from 'node:assert/strict';
import test from 'node:test';
import {getAccountTransferPreview} from '../../features/wallet/domain/accountTransferPreview';

test('saldo de origem e projeção usam centavos, sem arredondamento cumulativo',()=>{
  assert.deepEqual(getAccountTransferPreview(1716.21,200.01),{
    balanceCents:171621,remainingCents:151620,insufficientFunds:false,
  });
  assert.equal(getAccountTransferPreview(0.3,0.2).remainingCents,10);
});

test('transferência de valor igual ao saldo é permitida',()=>{
  assert.deepEqual(getAccountTransferPreview(20,20),{
    balanceCents:2000,remainingCents:0,insufficientFunds:false,
  });
});

test('transferência maior que saldo é sinalizada',()=>{
  assert.deepEqual(getAccountTransferPreview(20,20.01),{
    balanceCents:2000,remainingCents:-1,insufficientFunds:true,
  });
});

test('saldos e valores desconhecidos não produzem projeção fictícia',()=>{
  for(const invalid of [NaN,Infinity,-1,0.001]){
    assert.equal(getAccountTransferPreview(invalid,2).balanceCents,null);
  }
  for(const invalid of [NaN,Infinity,-1,0,0.001]){
    assert.equal(getAccountTransferPreview(200,invalid).remainingCents,null);
  }
  assert.equal(getAccountTransferPreview(Number.MAX_SAFE_INTEGER,1).balanceCents,null);
});
