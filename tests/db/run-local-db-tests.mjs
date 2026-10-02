import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionProjectRef = 'hzchchbxkhryextaymkn';
const protectedEnvNames = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL', 'PGHOST'];

for (const name of protectedEnvNames) {
  const value = process.env[name] || '';
  if (!value) continue;
  const lower = value.toLowerCase();
  const isProduction = lower.includes(productionProjectRef) || lower.includes('.supabase.co');
  const isLocal = lower.includes('127.0.0.1') || lower.includes('localhost');
  if (isProduction || !isLocal) {
    console.error(`test:db abortado: ${name} não pode apontar para banco remoto.`);
    process.exit(2);
  }
}

const localHarness = spawnSync(process.execPath, [path.join(root, 'tests', 'financial', 'payment-engine-local.test.mjs')], {
  cwd: root,
  encoding: 'utf8',
});
process.stdout.write(localHarness.stdout || '');
process.stderr.write(localHarness.stderr || '');
if (localHarness.status !== 0) process.exit(localHarness.status ?? 1);

if (!fs.existsSync(path.join(root, 'supabase', 'config.toml'))) {
  console.error('test:db bloqueado: supabase/config.toml não existe; nenhum banco remoto será usado.');
  process.exit(2);
}

const docker = spawnSync('docker', ['info'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (docker.error?.code === 'ENOENT' || docker.status !== 0) {
  console.error('test:db bloqueado: Docker não está disponível ou não está em execução.');
  console.error('Inicie o Docker Desktop e execute npm run test:db novamente; nenhum banco remoto foi usado.');
  process.exit(2);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const dbTests = spawnSync(npxCommand, ['supabase', 'test', 'db', '--local', path.join('supabase', 'tests')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(dbTests.status ?? 1);
