import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreditCard } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { CardProtectedFields, emptyProtectedCard } from '../../components/wallet/CardProtectedFields';
import { BankAccountDetailsFields, BankAccountDetailsSummary } from '../../components/wallet/BankAccountDetailsFields';
import { bankDetailsDraft, normalizeBankDetails } from '../../features/wallet/domain/bankAccountDetails';

test('wallet header uses the existing page title, round icon and subtitle pattern',()=>{
  const html=renderToStaticMarkup(<PageHeader icon={<CreditCard/>} title={<>Minha <span>Carteira</span></>} subtitle="Contas, cartões e compromissos"/>);
  for(const value of ['page-header-icon','rounded-full','page-header-title','page-header-subtitle','uppercase'])assert.ok(html.includes(value));
});
test('full card fields are available and hidden by default without disabled CVC placeholders',()=>{
  const html=renderToStaticMarkup(<CardProtectedFields value={emptyProtectedCard()} onChange={()=>{}}/>);
  for(const value of ['Número completo','CVC/CVV','Senha para proteger','Confirmar senha','Mostrar número e CVC'])assert.ok(html.includes(value));
  assert.ok(html.includes('type="password"'));assert.ok(!html.includes('readOnly'));
});
test('shared modal renders one cancel control alongside its save action',()=>{
  const html=renderToStaticMarkup(<Modal title="Novo cartão" onClose={()=>{}} footer={<button type="submit" form="card-test">Salvar cartão</button>}><form id="card-test"/></Modal>);
  assert.equal((html.match(/Cancelar/g)||[]).length,1);assert.ok(html.includes('form="card-test"'));
});
test('optional bank identity and products retain leading zeros and decimal cents',()=>{
  const draft={...bankDetailsDraft(),agency:'0012',account_number:'000123',has_credit_card:true,credit_card_limit:'1.500,75',has_overdraft:true,overdraft_limit:'500,50',has_loans:true,loan_balance:'10.000,25'};
  const normalized=normalizeBankDetails(draft);
  assert.equal(normalized.agency,'0012');assert.equal(normalized.account_number,'000123');assert.equal(normalized.credit_card_limit,1500.75);assert.equal(normalized.loan_balance,10000.25);
  const html=renderToStaticMarkup(<BankAccountDetailsFields value={draft} onChange={()=>{}}/>);
  for(const text of ['Nome do titular','Agência','Número da conta','cartão de crédito','cheque especial','empréstimos','não alteram o saldo'])assert.ok(html.includes(text),text);
  const summary=renderToStaticMarkup(<BankAccountDetailsSummary details={normalized} linkedCards={2}/>);
  assert.ok(summary.includes('000123'));assert.ok(summary.includes('10.000,25'));
  assert.throws(()=>normalizeBankDetails({...draft,loan_balance:'-1'}),/válido/i);
});
