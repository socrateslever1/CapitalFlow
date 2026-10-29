import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalletOverviewSummary } from '../../features/wallet/components/WalletOverviewSummary';
import { AccountCardStack } from '../../components/wallet/AccountCardStack';
import { WalletCapitalLinks } from '../../features/wallet/components/WalletCapitalLinks';
import { getCreditSummary } from '../../components/wallet/walletPresentation';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';

const accounts: PersonalWalletAccount[]=[{id:'a',nickname:'Conta de teste com nome extenso',bank_name:'Banco',account_type:'CHECKING',balance:123.45}];
const cards: PersonalWalletCard[]=[{id:'c',nickname:'Cartão de teste',issuer:'Banco',brand:'Mastercard',last_four:'1234',credit_limit:1000,used_limit:100,closing_day:1,due_day:10,current_bill:100,status:'ACTIVE'}];
test('summary renders account balances, current invoice and card identification using supplied values',()=>{
  const html=renderToStaticMarkup(<WalletOverviewSummary accounts={accounts} cards={cards} accountBalance={123.45} currentInvoiceTotal={100} credit={getCreditSummary(cards)} onNavigate={()=>{}}/>);
  for(const text of ['Conta de teste com nome extenso','123,45','100,00','900,00','Cartão de teste','1234','Ver detalhes das contas','Ver cartões e faturas']) assert.ok(html.includes(text),text);
  assert.equal((html.match(/role="progressbar"/g)||[]).length,1);
  assert.ok(!html.includes('toque ou deslize'));
});
test('empty and negative balances render useful states without requiring a linked source',()=>{
  const empty=renderToStaticMarkup(<AccountCardStack accounts={[]} onOpen={()=>{}}/>);
  assert.ok(empty.includes('Nenhuma conta cadastrada'));
  const negative=renderToStaticMarkup(<AccountCardStack accounts={[{...accounts[0],balance:-12.34}]} onOpen={()=>{}}/>);
  assert.ok(negative.includes('12,34')); assert.ok(negative.includes('Saldo consolidado'));
  const links=renderToStaticMarkup(<WalletCapitalLinks accounts={accounts} sources={[]}/>);
  assert.ok(links.includes('Sem vínculo com Capital')); assert.ok(!links.includes('<form'));
});
