import assert from 'node:assert/strict';
import test from 'node:test';
import { describeFluxTransportFailure, readFunctionsError } from '../../services/ai/fluxTransport';

test('unreachable server is reported honestly without inventing data', () => {
  const f = describeFluxTransportFailure(null);
  assert.equal(f.code, 'UNREACHABLE');
  assert.match(f.message, /não conseguiu se conectar/);
  assert.match(f.message, /Nenhuma consulta financeira adicional foi iniciada/);
  assert.doesNotMatch(f.message, /R\$\s?\d/);
});
test('HTTP statuses map to distinct diagnostics', () => {
  assert.equal(describeFluxTransportFailure(404).code, 'NOT_DEPLOYED');
  assert.equal(describeFluxTransportFailure(401).code, 'SESSION');
  assert.match(describeFluxTransportFailure(403, 'Mascote disponível somente para o perfil master.').message, /perfil master/);
  assert.equal(describeFluxTransportFailure(400, 'Mensagem vazia ou extensa demais.').code, 'BAD_REQUEST');
  const server = describeFluxTransportFailure(503, 'Serviço indisponível.');
  assert.equal(server.code, 'SERVER');
  assert.match(server.message, /código 503\): Serviço indisponível\./);
  assert.equal(describeFluxTransportFailure(200).code, 'EMPTY_REPLY');
});
test('untrusted server bodies (HTML, stack traces, long text) are never echoed', () => {
  assert.doesNotMatch(describeFluxTransportFailure(500, '<html>boom</html>').message, /html/);
  assert.doesNotMatch(describeFluxTransportFailure(500, 'TypeError: x at foo (index.ts:1)').message, /TypeError/);
  assert.doesNotMatch(describeFluxTransportFailure(403, 'a'.repeat(400)).message, /aaaa/);
});
test('reads status and { error } from a FunctionsHttpError-like object', async () => {
  const response = new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401 });
  assert.deepEqual(await readFunctionsError({ context: response }), { status: 401, serverError: 'Sessão inválida.' });
  assert.deepEqual(await readFunctionsError(new Error('fetch failed')), { status: null, serverError: null });
  const html = new Response('<html/>', { status: 502 });
  assert.deepEqual(await readFunctionsError({ context: html }), { status: 502, serverError: null });
});
