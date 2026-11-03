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
  assert.deepEqual(await decryptCardData(envelope,password,owner),{...input,securityCode:''});
  await assert.rejects(decryptCardData(envelope,'wrong vault password',owner),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData(envelope,password,'another-owner'),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData({...envelope,context_id:'different-card'},password,owner),/Senha incorreta|adulterados/);
  await assert.rejects(decryptCardData({...envelope,iterations:1},password,owner),/Formato/);
});
test('legacy writer discards authentication codes and refuses a short password',async()=>{
  const envelope=await encryptCardData({number:'4111111111111111',securityCode:'never retain this'},password,owner,context);
  assert.equal((await decryptCardData(envelope,password,owner)).securityCode,'');
  await assert.rejects(encryptCardData({number:'4111111111111111',securityCode:''},'short',owner,context),/12 caracteres/);
});

test('existing v1 data containing a code remains readable for a controlled migration',async()=>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const legacy={number:'4111111111111111',securityCode:'123'};
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`CapitalFlow/Card/v1/${owner}/${context}`)},key,new TextEncoder().encode(JSON.stringify(legacy)));
  const encode=(value:ArrayBuffer|Uint8Array)=>Buffer.from(value instanceof Uint8Array?value:new Uint8Array(value)).toString('base64');
  assert.deepEqual(await decryptCardData({version:1,algorithm:'AES-GCM',iterations:600000,salt:encode(salt),iv:encode(iv),ciphertext:encode(ciphertext),context_id:context},password,owner),legacy);
});
