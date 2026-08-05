import assert from 'node:assert/strict';

import { buildPreContractNotice } from './preContractNotice';

const expected = 'Olá, Maria da Silva, seu pré-contrato digital está disponível para leitura e assinatura antes da liberação do valor. Acesse pelo link: https://capitalflow.test/assinar/abc. Leia com atenção e assine digitalmente para que possamos continuar a análise e liberação. Em caso de dúvidas, responda esta mensagem.';

const preferred = buildPreContractNotice({
  clientName: ' Maria\n da   Silva ',
  signUrl: 'https://capitalflow.test/assinar/abc',
  portalUrl: 'https://capitalflow.test/portal/fallback',
});

assert.equal(preferred.message, expected);
assert.equal(preferred.signatureUrl, 'https://capitalflow.test/assinar/abc');
assert.equal(/[\r\n]/.test(preferred.message), false);

const fallback = buildPreContractNotice({
  clientName: 'Joao',
  portalUrl: 'https://capitalflow.test/portal/xyz',
});
assert.equal(fallback.signatureUrl, 'https://capitalflow.test/portal/xyz');

assert.throws(
  () => buildPreContractNotice({ clientName: 'Joao', signUrl: 'javascript:alert(1)' }),
  /Link de assinatura nao disponivel/,
);

console.log('preContractNotice: 4 assertions passed');
