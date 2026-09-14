import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {FinancialStatementPage} from './FinancialStatementPage';

test('extrato mostra um recebimento com duas partes e ambos os destinos',()=>{
 const date=new Date().toISOString();
 const base={date,type:'PAYMENT',lateFeeDelta:0,createdAt:date,operatorId:'operator'};
 const ledger=[{...base,id:'profit',amount:538.65,principalDelta:0,interestDelta:538.65,sourceId:'profit-wallet',category:'LUCRO',idempotencyKey:'event_lucro'},
 {...base,id:'principal',amount:46.35,principalDelta:46.35,interestDelta:0,sourceId:'capital-wallet',category:'PAGAMENTO',idempotencyKey:'event'}];
 const html=renderToStaticMarkup(<FinancialStatementPage profileId="fixture" loans={[{id:'loan',debtorName:'Cliente agrupado',sourceId:'capital-wallet',ledger,installments:[]} as any]} sources={[{id:'capital-wallet',name:'RecargaPay',type:'BANK',balance:100},{id:'profit-wallet',name:'Caixa Livre',type:'CASH',balance:538.65}] as any} isStealthMode={false} isLoading={false} onRefresh={()=>{}} onOpenLoan={()=>{}}/>);
 assert.equal((html.match(/data-payment-group="event"/g)||[]).length,1);
 assert.match(html,/585,00/);assert.match(html,/538,65/);assert.match(html,/46,35/);
 assert.match(html,/Destino: RecargaPay/);assert.match(html,/Destino: Caixa Livre/);
 assert.equal((html.match(/>Estornar<|>Estornar<!--/g)||[]).length,1);
});
