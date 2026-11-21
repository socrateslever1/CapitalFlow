import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountCategoryReducer,
  initialAccountCategorySelection,
} from '../../components/wallet/accountCategorySelection';
import { suggestWalletAccountCategory } from '../../features/wallet/domain/suggestWalletAccountCategory';

test('categoria personalizada continua editável ao atravessar o nome de categoria existente', () => {
  let state = accountCategoryReducer(initialAccountCategorySelection, { type: 'select', value: '__custom__' });
  for (const value of ['Com', 'Compras', 'Compras online']) {
    state = accountCategoryReducer(state, { type: 'type', value });
    assert.equal(state.customMode, true);
    assert.equal(state.value, value);
  }
  state = accountCategoryReducer(state, { type: 'select', value: 'Saúde' });
  assert.deepEqual(state, { value: 'Saúde', customMode: false });
  assert.deepEqual(accountCategoryReducer(state, { type: 'reset' }), initialAccountCategorySelection);
});

test('descrição reconhecida sugere categoria sem sobrescrever seleção manual',()=>{
  assert.equal(suggestWalletAccountCategory('Alimentação',false),'Alimentação');
  assert.equal(suggestWalletAccountCategory('IFood pedido',false),'Alimentação');
  assert.equal(suggestWalletAccountCategory('Uber viagem',false),'Transporte');
  assert.equal(suggestWalletAccountCategory('Farmácia Popular',false),'Saúde');
  assert.equal(suggestWalletAccountCategory('Alimentação',true),null);
  assert.equal(suggestWalletAccountCategory('Operação desconhecida',false),null);
  assert.equal(suggestWalletAccountCategory('',false),null);
});
