import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSourceReferenceDisplay } from '../../domain/sources/sourceReferenceDisplay';
import type { WalletReference } from '../../domain/sources/sourceWalletReference';

const s='00000000-0000-4000-8000-000000000001';
const a='00000000-0000-4000-8000-000000000002';
const c='00000000-0000-4000-8000-000000000003';
const account={id:a,nickname:'Conta pessoal',balance:950,capital_source_id:null};
const card={id:c,nickname:'Nubank',available_limit:1005.92,status:'ACTIVE'};

test('sem vínculo salvo não inventa saldo associado',()=>{
  assert.equal(buildSourceReferenceDisplay([], [account], [card]),null);
});

test('uma fonte com cartão e conta exibe ambos sem alterar saldo operacional',()=>{
  const links:WalletReference[]=[
    {source_id:s,target_kind:'CARD',target_id:c,allocated_amount:null},
    {source_id:s,target_kind:'ACCOUNT',target_id:a,allocated_amount:200},
  ];
  const result=buildSourceReferenceDisplay(links,[account],[card]);
  assert.equal(result?.total,1205.92);
  assert.deepEqual(result?.entries.map(x=>x.amount),[1005.92,200]);
  assert.equal(result?.entries[0].name,'Nubank');
  assert.equal(result?.entries[1].manuallyAllocated,true);
});

test('zero explicitamente informado continua zero e valores desconhecidos não viram zero',()=>{
  const zero=buildSourceReferenceDisplay([
    {source_id:s,target_kind:'CARD',target_id:c,allocated_amount:0},
  ],[],[card]);
  assert.equal(zero?.total,0);
  const missing=buildSourceReferenceDisplay([
    {source_id:s,target_kind:'CARD',target_id:c,allocated_amount:null},
  ],[],[]);
  assert.equal(missing?.total,null);
});

test('cartão da fonte e lista carregam referências e atualizam após salvar',()=>{
  const cardComponent=readFileSync('components/cards/SourceCard.tsx','utf8');
  const listPage=readFileSync('pages/SourcesPage.tsx','utf8');
  const editor=readFileSync('components/sources/SourceWalletReferencePanel.tsx','utf8');
  assert.match(cardComponent,/Valor associado na Minha Carteira/);
  assert.match(cardComponent,/Saldo operacional/);
  assert.match(listPage,/referenceDisplay=\{sourceReferences\[source.id\]/);
  assert.match(listPage,/capital_source_wallet_references/);
  assert.match(listPage,/can_manage_capital_source_wallet_origins/);
  assert.match(listPage,/capitalflow:source-origins-updated/);
  assert.match(editor,/dispatchEvent\(new CustomEvent\('capitalflow:source-origins-updated'/);
  assert.doesNotMatch(listPage,/.from\('fontes'\).update/);
});
