import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryptCardData, decryptCardData, validateCardNumber } from '../../features/wallet/domain/cardVault';

const owner='10000000-0000-4000-8000-000000000001';
const context='20000000-0000-4000-8000-000000000001';
const password='test-only vault passphrase';
test('full number validation preserves leading digits and rejects invalid checksums',()=>{
  assert.equal(validateCardNumber('4111 1111 1111 1111'),'4111111111111111');
  assert.throws(()=>validateCardNumber('4111111111111112'),/inválido/);
  assert.throws(()=>validateCardNumber('1234'),/completo/);
});
test('protected data round-trips and never exposes PAN or CVC in the stored envelope',async()=>{
  const input={number:'4111111111111111',securityCode:'123'};
  const envelope=await encryptCardData(input,password,owner,context);
  const other=await encryptCardData(input,password,owner,context);
  assert.notEqual(envelope.ciphertext,other.ciphertext);
  assert.ok(!JSON.stringify(envelope).includes(input.number));
  assert.deepEqual(await decryptCardData(envelope,password,owner),input);
  await assert.rejects(decryptCardData(envelope,'wrong vault password',owner),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData(envelope,password,'another-owner'),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData({...envelope,context_id:'different-card'},password,owner),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData({...envelope,iterations:1},password,owner),/Formato/);
});
test('vault refuses missing full number, bad CVC and short password',async()=>{
  await assert.rejects(encryptCardData({number:'4111111111111111',securityCode:'12'},password,owner,context),/CVC/);
  await assert.rejects(encryptCardData({number:'4111111111111111',securityCode:''},'short',owner,context),/12 caracteres/);
});
