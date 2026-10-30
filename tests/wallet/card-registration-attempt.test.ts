import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CardRegistrationAttempt, CardRegistrationError, type CompleteCardRegistration } from '../../features/wallet/domain/cardRegistration';
const input:CompleteCardRegistration={card:{nickname:'Teste',issuer:'Banco',brand:'Visa',last_four:'1111',credit_limit:1000,closing_day:1,due_day:10},existingAccountId:null,opening:{used_limit:0,invoice_amount:0,future_amount:0,future_months:1,invoice_month:'2030-01-01'},requestId:'request-a',identity:{cardholder_name:'Titular',expiry_month:1,expiry_year:2030},envelope:null};
test('lost response and attempted edits replay the original creation instead of duplicating an opening',async()=>{
  const attempt=new CardRegistrationAttempt();const committed=new Set<string>();let openings=0;
  const submit=async(candidate:CompleteCardRegistration,loseResponse=false)=>{
    const request=attempt.begin(candidate);
    if(!committed.has(request.requestId)){committed.add(request.requestId);openings++;}
    if(loseResponse)throw new Error('response lost');
    attempt.confirmed();return request;
  };
  await assert.rejects(submit(input,true));
  const replay=await submit({...input,requestId:'request-b',identity:{...input.identity,cardholder_name:'Outro nome'}});
  assert.equal(openings,1);assert.equal(replay.requestId,'request-a');assert.equal(replay.identity.cardholder_name,'Titular');assert.equal(attempt.pending,null);
});
test('only a definitive rolled-back failure releases a submitted request for correction',()=>{
  const attempt=new CardRegistrationAttempt();attempt.begin(input);
  attempt.failed(new Error('unknown'));assert.ok(attempt.pending);
  attempt.failed(new CardRegistrationError('validation rolled back',true));assert.equal(attempt.pending,null);
});
