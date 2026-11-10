// Protege o pacote do servidor de cobrança 24h (automation/server) e o gatilho "Cobrar agora".
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveManualCollectionTriggerUrl } from '../../services/n8nManualCollectionTrigger.service';

const compose = readFileSync('automation/server/docker-compose.yml', 'utf8');
const caddy = readFileSync('automation/server/Caddyfile', 'utf8').replace(/\r\n/g, '\n');
const envExample = readFileSync('automation/server/.env.example', 'utf8');

test('versões fixas: nenhuma imagem "latest" no servidor', () => {
  assert.doesNotMatch(compose, /image:\s*\S+:latest/);
  assert.match(compose, /image: n8nio\/n8n:1\.50\.0/);
});

test('só o Caddy fica aberto à internet; WAHA apenas em 127.0.0.1; Redis com senha e sem porta', () => {
  const published = [...compose.matchAll(/^\s+-\s+"([^"]+:\d+)"\s*$/gm)].map(m => m[1]);
  assert.deepEqual(published.sort(), ['127.0.0.1:3000:3000', '443:443', '80:80'].sort());
  const redis = compose.slice(compose.indexOf('  redis:'));
  assert.doesNotMatch(redis.split('\nvolumes:')[0], /ports:/);
  assert.match(redis, /--requirepass/);
});

test('segredos obrigatórios vêm do .env e nunca estão escritos no compose', () => {
  for (const name of ['N8N_ENCRYPTION_KEY', 'CAPITALFLOW_N8N_SECRET', 'CAPITALFLOW_PROFILE_ID', 'WAHA_API_KEY', 'REDIS_PASSWORD', 'PAINEL_SENHA_HASH']) {
    assert.match(compose, new RegExp('\\$\\{' + name + ':\\?'), `${name} deve ser obrigatório`);
    assert.match(envExample, new RegExp('^' + name + '=', 'm'));
  }
  assert.doesNotMatch(envExample, /^(CAPITALFLOW_N8N_SECRET|WAHA_API_KEY|N8N_ENCRYPTION_KEY|REDIS_PASSWORD)=\S+/m, '.env.example não pode trazer segredo preenchido');
});

test('o arquivo .env do servidor é ignorado pelo Git', () => {
  const out = execFileSync('git', ['check-ignore', 'automation/server/.env'], { encoding: 'utf8' }).trim();
  assert.equal(out, 'automation/server/.env');
});

test('painel do n8n exige senha; só o gatilho de cobrança é público', () => {
  assert.match(caddy, /@gatilhoCobranca path \/webhook\/capitalflow-manual-collections-trigger\n/);
  assert.match(caddy, /handle \{\s*basic_auth \{/);
  assert.doesNotMatch(caddy, /\/webhook\/\*/);
});

test('gatilho "Cobrar agora" aceita HTTPS do servidor e recusa HTTP público', () => {
  const local = 'http://localhost:5678/webhook/capitalflow-manual-collections-trigger';
  assert.equal(resolveManualCollectionTriggerUrl(undefined), local);
  assert.equal(resolveManualCollectionTriggerUrl(''), local);
  assert.equal(resolveManualCollectionTriggerUrl('não é url'), local);
  assert.equal(resolveManualCollectionTriggerUrl('http://203.0.113.10:5678/webhook/x'), local);
  assert.equal(
    resolveManualCollectionTriggerUrl('https://automacao.exemplo.com.br/webhook/capitalflow-manual-collections-trigger'),
    'https://automacao.exemplo.com.br/webhook/capitalflow-manual-collections-trigger',
  );
});
