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
test('um banco e um cartão: cada valor é exibido apenas uma vez',()=>{
  const html=renderToStaticMarkup(<WalletOverviewSummary accounts={accounts} cards={cards}
    accountBalance={123.45} currentInvoiceTotal={100}
    credit={getCreditSummary(cards)} onNavigate={()=>{}}/>);
  for(const label of ['Conta de teste com nome extenso','Cartão de teste','1234',
    'Faturas com vencimento neste mês','Ver cartões e faturas'])
    assert.ok(html.includes(label),label);
  for(const amount of ['123,45','100,00','900,00'])
    assert.equal((html.match(new RegExp(amount.replace(',', '[,]'),'g'))||[]).length,1,
      'Valor duplicado: '+amount);
  assert.equal((html.match(/role="progressbar"/g)||[]).length,0,
    'Percentual global não deve duplicar dados de cartão único');
  assert.ok(!html.includes('Saldo consolidado'), 'Total não deve repetir uma única conta');
  assert.ok(!html.includes('Ver detalhes das contas'), 'Linha da conta já navega');
  assert.ok(html.includes('h-[132px]') || html.includes('h-\\[132px\\]'));
});

test('múltiplas fontes preservam os totais consolidados úteis',()=>{
  const secondAccount={...accounts[0],id:'b',nickname:'Segunda conta',balance:50};
  const secondCard={...cards[0],id:'d',nickname:'Segundo cartão',last_four:'5678',
    credit_limit:500,used_limit:250};
  const summary=renderToStaticMarkup(<WalletOverviewSummary
    accounts={[accounts[0],secondAccount]}
    cards={[cards[0],secondCard]}
    accountBalance={173.45} currentInvoiceTotal={100}
    credit={getCreditSummary([cards[0],secondCard])} onNavigate={()=>{}}/>);
  assert.ok(summary.includes('Saldo consolidado'));
  assert.ok(summary.includes('173,45'));
  assert.ok(summary.includes('Disponível nos 2 cartões'));
  assert.equal((summary.match(/role="progressbar"/g)||[]).length,1);
  assert.ok(summary.includes('Segundo cartão'));
  assert.ok(summary.includes('5678'));
});

test('empty and negative balances render useful states without requiring a linked source',()=>{
  const empty=renderToStaticMarkup(<AccountCardStack accounts={[]} onOpen={()=>{}}/>);
  assert.ok(empty.includes('Nenhuma conta cadastrada'));
  const negative=renderToStaticMarkup(<AccountCardStack accounts={[{...accounts[0],balance:-12.34}]} onOpen={()=>{}}/>);
  assert.ok(negative.includes('12,34')); assert.ok(negative.includes('Saldo consolidado'));
  const links=renderToStaticMarkup(<WalletCapitalLinks accounts={accounts} sources={[]}/>);
  assert.ok(links.includes('Sem vínculo com Capital')); assert.ok(!links.includes('<form'));
});
