import assert from 'node:assert/strict';
import {classifySkillIntentWithContext} from '../skills/integration/intentClassifier';
import {transitionConversationState,restoreConversationState,observedStateForIntent,type ConversationState} from '../skills/integration/conversationState';

type Trace={name:string;start:ConversationState;events:ReadonlyArray<{event:Parameters<typeof transitionConversationState>[1];expected:ConversationState}>};
const traces:Trace[]=[
 {name:'authenticated read and completion',start:'NEW',events:[
  {event:'IDENTITY_CONFIRMED',expected:'IDENTIFIED'},
  {event:'READ_INTENT',expected:'RESOLVING_READ'},
  {event:'EXECUTION_SUCCESS',expected:'IDENTIFIED'},
  {event:'COMPLETE',expected:'COMPLETED'}]},
 {name:'explicit cancel before execution',start:'IDENTIFIED',events:[
  {event:'WRITE_INTENT',expected:'AWAITING_CONFIRMATION'},
  {event:'CANCEL',expected:'IDENTIFIED'}]},
 {name:'handoff and return',start:'IDENTIFIED',events:[
  {event:'HANDOFF_REQUESTED',expected:'HUMAN_HANDOFF'},
  {event:'HANDOFF_CLOSED',expected:'IDENTIFIED'}]}
];
for(const trace of traces){
 let state=trace.start;
 for(const step of trace.events){
  const result=transitionConversationState(state,step.event);
  assert.equal(result.ok,true,trace.name+': '+step.event);
  assert.equal(result.state,step.expected);
  state=result.state;
 }
}
for(const state of ['NEW','IDENTIFYING','IDENTIFIED','INTENT_PENDING','RESOLVING_READ'] as const){
 const invalid=transitionConversationState(state,'CONFIRM');
 assert.equal(invalid.ok,false,state+' may not confirm');
}
const stale=restoreConversationState({state:'AWAITING_CONFIRMATION',version:8,expiresAt:'2020-01-01T00:00:00.000Z'},new Date('2026-10-25T00:00:00.000Z'));
assert.equal(stale.state,'NEW'); assert.equal(stale.version,9);
const invalid=restoreConversationState({state:'EXECUTING',version:0},new Date('2026-10-25T00:00:00.000Z'));
assert.equal(invalid.state,'NEW');
const crashed=restoreConversationState({state:'EXECUTING',version:4},new Date('2026-10-25T00:00:00.000Z'));
assert.deepEqual(crashed,{state:'NEW',version:5},'an interrupted execution cannot be replayed');
const indefinite=restoreConversationState({state:'AWAITING_CONFIRMATION',version:4});
assert.deepEqual(indefinite,{state:'IDENTIFIED',version:5},'confirmation requests must have expiry');
const validConfirmation=restoreConversationState({
 state:'AWAITING_CONFIRMATION',version:4,expiresAt:'2026-10-25T00:15:00.000Z'
},new Date('2026-10-25T00:00:00.000Z'));
assert.equal(validConfirmation.state,'AWAITING_CONFIRMATION');
const classified=classifySkillIntentWithContext('Registre um pagamento da parcela', {identified:true});
assert.equal(observedStateForIntent(true,classified),'IDENTIFIED','financial writes must stay blocked in shadow');
console.log(JSON.stringify({suite:'multi-turn-state-security',traces:traces.length,checks:'passed',financialWritesEnabled:false}));
