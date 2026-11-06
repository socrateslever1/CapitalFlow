import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { FinancialPrivacyProvider } from '../../contexts/FinancialPrivacyContext';
import { WalletSpendingGuide } from '../../features/wallet/components/WalletSpendingGuide';
import { WalletOverviewSummary } from '../../features/wallet/components/WalletOverviewSummary';
import { WalletBalanceOverview } from '../../components/wallet/WalletBalanceOverview';
import { getCreditSummary } from '../../components/wallet/walletPresentation';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';

const accounts: PersonalWalletAccount[] = [
  { id:'checking', nickname:'Conta teste', bank_name:'Banco teste', account_type:'CHECKING', balance:-1234.56 },
];
const cards: PersonalWalletCard[] = [
  { id:'card1', nickname:'Cartão teste', issuer:'Banco teste', brand:'Mastercard', last_four:'5088',
    credit_limit:3000, used_limit:2345.12, closing_day:26, due_day:5, status:'ACTIVE' },
  { id:'card2', nickname:'Outro cartão', issuer:'Outro banco', brand:'Visa', last_four:'0088',
    credit_limit:1500, used_limit:100, closing_day:15, due_day:22, status:'ACTIVE' },
];
const spending = {
  total:108.34, count:2, previousTotal:53.21,
  categories:[
    {name:'Despesas', amount:102.04, count:1, percentage:94},
    {name:'Alimentação', amount:6.30, count:1, percentage:6},
  ],
};
const wrap = (hidden:boolean,node:React.ReactNode) =>
  renderToStaticMarkup(<FinancialPrivacyProvider hidden={hidden}>{node}</FinancialPrivacyProvider>);

test('o olho oculta despesas, categorias, previsões, percentuais e barras sem vazar no HTML', () => {
  const node=<WalletSpendingGuide projectedBalance={-102.04} creditPercent={64}
    cardCount={2} pendingCount={4} overdueCount={1}
    spending={spending} onNavigate={()=>{}} />;
  const visible=wrap(false,node);
  assert.match(visible,/108,34/);
  assert.match(visible,/102,04/);
  assert.match(visible,/94%/);
  assert.match(visible,/Exige atenção/);
  const hidden=wrap(true,node);
  assert.match(hidden,/Indicadores, percentuais e gráficos ocultos/);
  for(const leak of ['108,34','102,04','6,30','53,21','94%','64%',
    'Déficit','Superávit','Exige atenção','Alimentação','role="progressbar"','aria-valuenow']) {
    assert(!hidden.includes(leak),'Vazamento visual: '+leak);
  }
});

test('cartões múltiplos não divulgam limite percentual, barra ou finais quando ocultos',()=>{
  const node=<WalletOverviewSummary accounts={accounts} cards={cards}
    accountBalance={-1234.56} currentInvoiceTotal={102.04}
    credit={getCreditSummary(cards)} onNavigate={()=>{}}/>;
  const visible=wrap(false,node);
  assert.match(visible,/role="progressbar"/);
  assert.match(visible,/5088/);
  const hidden=wrap(true,node);
  for(const leak of ['1.234,56','102,04','5088','0088','role="progressbar"',
    'aria-valuenow','width:','Disponível nos 2 cartões']) {
    assert(!hidden.includes(leak),'Vazamento no resumo: '+leak);
  }
  assert.match(hidden,/R\$ ••••/);
});

test('balanço secundário não revela sinal ou status financeiro quando oculto',()=>{
  const node=<WalletBalanceOverview accounts={accounts} recurringIncomes={[]}
    receivedIncomeIds={new Set()} openCardInvoices={102.04} payables={[]}
    month="2026-11"/>;
  const visible=wrap(false,node);
  assert.match(visible,/Déficit Previsto/);
  const hidden=wrap(true,node);
  assert.match(hidden,/Valores e indicadores protegidos/);
  for(const leak of ['1.234,56','102,04','Déficit','Superávit','Saldo Projetado do Mês']) {
    assert(!hidden.includes(leak),'Vazamento no balanço: '+leak);
  }
});

test('a proteção é efetiva nas páginas de balanço e relatório, inclusive no status',()=>{
 const overview=readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
 const report=readFileSync('features/wallet/pages/WalletReportPage.tsx','utf8');
 const assistant=readFileSync('components/ai/MasterMascot.tsx','utf8');
 assert.match(overview,/privacyHidden \? 'Indicador oculto'/);
 assert.match(overview,/!privacyHidden && <details/);
 assert.match(overview,/privacyHidden \? <p className="mt-4/);
 assert.match(report,/report && privacyHidden && <section/);
 assert.match(report,/report && !privacyHidden && <>/);
 assert.match(assistant,/if \(privacyHidden\) \{ setCue\(null\); setOpen\(false\); \}/);
 const cards=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
 assert.match(cards,/hideFinancialValues \? 'Situação protegida' : label/);
 assert.match(cards,/hideFinancialValues \? 'Vencimento protegido'/);
 const account=readFileSync('components/wallet/AccountCardStack.tsx','utf8');
 assert.match(account,/privacyHidden \? 'text-slate-300'/);

});
