import assert from 'node:assert/strict';
import test from 'node:test';
import { formatContractSaveError } from '../../features/loans/domain/contractSaveError';

test('informa erro de referência sem revelar estrutura do banco', () => {
  const result = formatContractSaveError({ code: '23503', message: 'violates foreign key constraint' });
  assert.match(result, /cliente ou a fonte de capital/i);
  assert.doesNotMatch(result, /constraint|23503/i);
});

test('diferencia duplicidade de falha de conexão', () => {
  assert.match(formatContractSaveError({ code: '23505', message: 'duplicate key' }), /já existe/i);
  assert.match(formatContractSaveError(new TypeError('Failed to fetch')), /conexão/i);
});

test('conserva a validação de fonte de capital em português', () => {
  const message = 'Selecione uma fonte de capital para emitir o contrato.';
  assert.equal(formatContractSaveError(new Error(message)), message);
});

test('não revela mensagens SQL não reconhecidas ou CPF', () => {
  const result = formatContractSaveError(new Error('insert failed: CPF 123.456.789-00'));
  assert.doesNotMatch(result, /123|insert failed/i);
  assert.match(result, /Não foi possível emitir/i);
});

test('preserva alerta de registro financeiro parcialmente concluído', () => {
  const message = 'O contrato pode ter sido gravado, mas a movimentação inicial falhou. Confira o contrato e a fonte de capital antes de tentar novamente.';
  assert.equal(formatContractSaveError(new Error(message)), message);
});
