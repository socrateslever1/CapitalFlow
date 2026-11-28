import assert from 'node:assert/strict';
import test from 'node:test';
import { withWalletOperationDeadline,WalletOperationTimeoutError } from '../../features/wallet/utils/operationConfirmation';

test('sucesso não espera pela atualização de tela',async()=>{
  const id=await withWalletOperationDeadline(Promise.resolve('confirmed'),50);
  assert.equal(id,'confirmed');
});

test('prazo expirado devolve controle e não reexecuta a gravação',async()=>{
  let calls=0;
  const stillPending=new Promise<string>(()=>{calls++;});
  await assert.rejects(withWalletOperationDeadline(stillPending,10),WalletOperationTimeoutError);
  assert.equal(calls,1);
});

test('erros do servidor não são convertidos em sucesso',async()=>{
  await assert.rejects(
    withWalletOperationDeadline(Promise.reject(new Error('Saldo insuficiente')),50),
    /Saldo insuficiente/,
  );
});
