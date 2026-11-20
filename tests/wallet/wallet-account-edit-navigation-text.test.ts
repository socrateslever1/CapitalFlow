import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAccountStatementEntries, normalizeWalletStatementDescription } from '../../components/wallet/accountStatementDomain';

const repoFile = (path: string) => readFileSync(path,'utf8');

test('Voltar de conta remove parâmetro sem retornar ao Painel', () => {
  const page=repoFile('features/wallet/pages/WalletAccountsPage.tsx');
  const close=page.slice(page.indexOf('const closeAccount ='),page.indexOf('useEffect(() => {',page.indexOf('const closeAccount =')));
  assert.match(close,/next\.delete\('conta'\)/);
  assert.match(close,/setSearchParams\(next, \{ replace: true \}\)/);
  assert.doesNotMatch(close,/navigate\(-1\)/);
  assert.match(page,/onBack=\{closeAccount\}/);
});
test('descrição de empréstimo é normalizada mantendo nome e valor corretos', () => {
  assert.equal(normalizeWalletStatementDescription('EmprÃ©stimo concedido Â· Pessoa Exemplo'),'Empréstimo · Pessoa Exemplo');
  assert.equal(normalizeWalletStatementDescription('Empréstimo concedido · Pessoa Exemplo'),'Empréstimo · Pessoa Exemplo');
  assert.equal(normalizeWalletStatementDescription('Empréstimo · Pessoa Exemplo'),'Empréstimo · Pessoa Exemplo');
  const entry = buildAccountStatementEntries({
    accountId:'acc1',accounts:[{id:'acc1',nickname:'Banco'}],
    operations:[{
      id:'loan1',request_id:'loan1',operation_type:'LOAN_DISBURSEMENT',
      from_account_id:'acc1',to_account_id:null,amount:200,
      description:'EmprÃ©stimo concedido Â· Pessoa Exemplo',category:'EmprÃ©stimo concedido',
      contract_id:'contract1',operation_date:'2026-11-17',created_at:'2026-11-17T13:00:00Z',
    }],
    expenses:[],invoicePayments:[],statementRows:[],
  });
  assert.equal(entry.length,1);
  assert.equal(entry[0].label,'Empréstimo · Pessoa Exemplo');
  assert.equal(entry[0].tag,'Empréstimo concedido');
  assert.equal(entry[0].category,'Desembolso do contrato');
  assert.equal(entry[0].amount,-200);
});
test('edição manual exposta somente para operações elegíveis, com calculadora e auditoria', () => {
  const ui=repoFile('components/wallet/AccountActivityPanel.tsx');
  const service=repoFile('services/personalWallet.service.ts');
  const sql=repoFile('supabase/migrations/20261120215500_wallet_manual_edit_description_cleanup.sql');
  assert.match(ui,/personalWalletService\.editManualAccountOperation/);
  assert.match(ui,/personalWalletService\.voidManualAccountOperation/);
  assert.match(ui,/onSaved\(\)/);
  assert.match(ui,/<FinancialCalculatorInput required className=\{input\} value=\{editAmount\}/);
  assert.match(ui,/Editar movimentação/);
  assert.match(ui,/Excluir lançamento/);
  assert.match(ui,/operation\.contract_id \|\| operation\.installment_id \|\| operation\.charge_id/);
  assert.match(service,/personal_wallet_edit_manual_operation/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/v_delta:=CASE WHEN v_row.operation_type='EXPENSE'/);
  assert.match(sql,/UPDATE public\.personal_wallet_accounts SET balance=v_new_balance/);
  assert.match(sql,/personal_wallet_manual_operation_revisions/);
  assert.match(sql,/owner_user_id=v_user/);
  assert.match(sql,/v_row\.contract_id IS NOT NULL/);
  assert.match(sql,/v_row\.charge_id IS NOT NULL/);
  assert.doesNotMatch(sql,/DELETE FROM public\.personal_wallet_account_operations/i);
  assert.doesNotMatch(sql,/UPDATE public\.contratos/i);
});
test('extrato diferencia resultado das movimentações de saldo da conta', () => {
  const ui=repoFile('components/wallet/AccountActivityPanel.tsx');
  assert.match(ui,/Resultado das movimentações/);
  assert.doesNotMatch(ui,/Total do extrato/);
});
