import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWalletMoney} from '../../features/wallet/utils/parseWalletMoney';
import {freshCardOpening,validateCardOpening} from '../../features/wallet/components/CardOpeningFields';

test('Brazilian money paste accepts grouped zeros and leading zeros without losing cents',()=>{
 for(const [source,expected] of [
  ['0.000,00',0],['0000,00',0],['1.146,98',1146.98],
  ['2800.00',2800],['2.800,00',2800],['001653,10',1653.10],
  ['410,55',410.55],['0,01',0.01],
 ] as const)assert.equal(parseWalletMoney(source),expected,source);
 for(const invalid of ['','R$ 10,00','1,234.56','1.23.4','abc','1,999','-5']){
  assert.throws(()=>parseWalletMoney(invalid),invalid);
 }
});

test('opening forms start blank and tolerate pt-BR values without changing initial arithmetic',()=>{
 const fresh=freshCardOpening();
 assert.equal(fresh.invoice,'');
 assert.equal(fresh.used,'');
 const result=validateCardOpening({
  ...fresh,invoice:'410,55',used:'1.653,10',invoiceMonth:'2026-11',
 },2800);
 assert.equal(result.invoice_amount,410.55);
 assert.equal(result.used_limit,1653.10);
 assert.equal(result.future_amount,1242.55);
 const blank=validateCardOpening({...fresh,invoiceMonth:'2026-11'},2800);
 assert.equal(blank.invoice_amount,0);
 assert.equal(blank.used_limit,0);
});

test('editing initial card values uses empty fields with existing-value fallback',()=>{
 const modal=readFileSync('components/wallet/CardInitialBalancesModal.tsx','utf8');
 assert.match(modal,/const \[limit, setLimit\] = useState\(''\)/);
 assert.match(modal,/const \[used, setUsed\] = useState\(''\)/);
 assert.match(modal,/const \[bill, setBill\] = useState\(''\)/);
 assert.match(modal,/limit\.trim\(\) \|\| String\(Number\(card\.credit_limit/);
 assert.match(modal,/used\.trim\(\) \|\| String\(initialUsed\)/);
 assert.match(modal,/bill\.trim\(\) \|\| String\(invoice\)/);
 for(const key of ['wallet-initial-limit','wallet-initial-used','wallet-initial-bill'])
  assert.ok(modal.includes('name="'+key+'"'));
 assert.doesNotMatch(modal,/<input required type="text" inputMode="decimal" value=\{limit\}/);
});

test('compact card view prioritizes amount, due date, pay/edit and preserves advanced actions',()=>{
 const page=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
 const statement=readFileSync('components/wallet/CardInvoiceStatement.tsx','utf8');
 const editor=readFileSync('components/wallet/InvoiceOverrideModal.tsx','utf8');
 for(const word of ['Fatura a pagar','Vence em','Editar fatura','Ver / editar lançamentos','Mais informações','Mais ações','setPaying(selected)'])
  assert.ok(page.includes(word),word);
 assert.ok(!page.includes("cycle.hasOverride?' · consolidada'"));
 assert.ok(page.includes('onEdit={async'));
 assert.ok(page.includes('onDelete={async'));
 assert.ok(statement.includes('Remover saldo inicial'));
 assert.ok(!statement.includes('Valor consolidado'));
 assert.match(editor,/Valor da fatura/);
 assert.match(editor,/Vencimento/);
 assert.match(editor,/parseWalletMoney/);
 assert.match(editor,/hasExistingConsolidation/);
});

test('payables and recurring amounts use text decimal with the shared money parser',()=>{
 const manager=readFileSync('features/wallet/pages/WalletPayablesManagement.tsx','utf8');
 const recurring=readFileSync('components/wallet/RecurringObligationsPanel.tsx','utf8');
 const pay=readFileSync('components/wallet/WalletPayablesPanel.tsx','utf8');
 for(const source of [manager,recurring,pay]){
  assert.ok(source.includes('parseWalletMoney('));
  assert.ok(source.includes('inputMode="decimal"'));
 }
});
