import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinancialSearchMatcher } from '../../features/wallet/utils/financialSearch';

type Entry = Parameters<ReturnType<typeof createFinancialSearchMatcher>>[0];
const matches = (query:string, entry:Entry) => createFinancialSearchMatcher(query)(entry);

test('valores em reais reconhecidos por variantes de escrita',()=>{
  const row={amounts:[700]};
  for(const query of ['700','700,00','700.00','R$ 700','R$ 700,00','+700'])
    assert.equal(matches(query,row),true,query);
  assert.equal(matches('700',{amounts:[1700]}),false);
  assert.equal(matches('1.700,00',{amounts:[1700]}),true);
  assert.equal(matches('1700.00',{amounts:[1700]}),true);
  assert.equal(matches('700,01',row),false);
});

test('parcela encontrada também pelo valor original da compra',()=>{
  const invoice={texts:['Compra parcelada','Alimentação','1/3'],amounts:[700,233.33,0],dates:['2026-11-20']};
  assert.equal(matches('700',invoice),true);
  assert.equal(matches('233,33',invoice),true);
  assert.equal(matches('alimentacao 233,33',invoice),true);
  assert.equal(matches('20/11/2026',invoice),true);
  assert.equal(matches('11/2026',invoice),true);
  assert.equal(matches('1/3',invoice),true);
  assert.equal(matches('999',invoice),false);
});

test('descrição, acentos, categorias e quantias negativas',()=>{
  const item={texts:['Mercado da Amazônia','Transporte'],amounts:[-156.88],dates:['2026-11-20T21:09:00-04:00']};
  assert.equal(matches('mercado amazonia',item),true);
  assert.equal(matches('TRANSporte',item),true);
  assert.equal(matches('-156,88',item),true);
  assert.equal(matches('+156,88',item),false);
  assert.equal(matches('R$ 156,88',item),true);
  assert.equal(matches('20/11/2026',item),true);
  assert.equal(matches('transporte 156',item),true);
});

test('não gerar correspondências com quantias desconhecidas',()=>{
  assert.equal(matches('700',{amounts:[NaN,Infinity]}),false);
  assert.equal(matches('700',{amounts:[]}),false);
  assert.equal(matches('',{texts:['Qualquer']}),true);
  assert.equal(matches('r$ 700',{amounts:[700]}),true);
});
