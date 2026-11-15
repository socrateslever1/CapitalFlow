import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics } from '../../services/localDiagnostics';

test('captura somente com sessão autorizada, agrupa e isola perfis', () => {
  const values = new Map<string,string>();
  const store = { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => { values.set(k,v); } };
  const log = createDiagnostics(store);
  log.record('runtime', new Error('segredo'));
  assert.equal(log.list().length, 0);
  log.setSession('master-a');
  log.record('runtime', new Error('Failed to fetch token=secret cliente Maria 12345678900'));
  log.record('runtime', new Error('Failed to fetch token=secret cliente Maria 12345678900'));
  assert.equal(log.list()[0].count, 2);
  const report = log.exportReport();
  for (const secret of ['secret', 'Maria', '12345678900', 'master-a']) assert.ok(!report.includes(secret));
  log.setSession(null);
  assert.equal(log.list().length, 0);
  log.setSession('master-b');
  assert.equal(log.list().length, 0);
  log.setSession('master-a');
  assert.equal(log.list().length, 1);
  log.clear();
  assert.equal(log.list().length, 0);
});

test('limita grupos e expira dados; storage indisponível não quebra o app', () => {
  let now = Date.now();
  const log = createDiagnostics({ getItem: () => { throw Error(); }, setItem: () => { throw Error(); } }, () => now);
  log.setSession('master');
  for (let i=0;i<120;i++) {
    const error = new Error('falha');
    error.stack = `Error\n at https://localhost/assets/index-Abc.js:${i+1}:4`;
    log.record('runtime', error);
  }
  assert.equal(log.list().length, 100);
  now += 8 * 86400000;
  assert.equal(log.list().length, 0);
});

test('não armazena mensagens livres, URLs, queries, objetos ou frames externos', () => {
  const log = createDiagnostics();
  log.setSession('master');
  const error = new Error('Senha=abc CPF=12345678900 CVV=123');
  error.stack = 'Error: segredo\n at https://localhost/assets/index-Abc.js?token=secret:10:4\n at https://evil.com/cliente.js:1:2';
  log.record('react', error);
  log.record('console', { message:'PII', password:'secret' });
  assert.ok(!/segredo|Senha|CPF|CVV|secret|evil|PII/.test(log.exportReport()));
});

test('classifica erros tratados sem guardar a mensagem e identifica a tela', () => {
  const log = createDiagnostics();
  log.setSession('master');
  log.setScreen('MY_WALLET');
  log.record('interface', 'Failed to fetch cliente João');
  assert.equal(log.list()[0].screen, 'MY_WALLET');
  assert.equal(log.list()[0].category, 'Conexão');
  assert.ok(!log.exportReport().includes('João'));
  log.setSession(null);
  log.setSession('master');
  assert.equal(log.list().length, 0, 'sem storage, não deve recuperar mensagens');
});
