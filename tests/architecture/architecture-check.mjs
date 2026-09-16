import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
};

const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

for (const file of walk(path.join(root, 'domain'))) {
  const text = fs.readFileSync(file, 'utf8');
  const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const specifier of imports) {
    if (/lib\/supabase|(^|\/)services(\/|$)|(^|\/)components(\/|$)|(^|\/)pages(\/|$)/.test(specifier)) {
      failures.push(`${relative(file)} -> import proibido no domínio: ${specifier}`);
    }
  }
}

const clientRoots = ['lib', 'components', 'pages', 'features', 'hooks', 'services', 'domain', 'utils'];
for (const rootName of clientRoots) {
  for (const file of walk(path.join(root, rootName))) {
    const text = fs.readFileSync(file, 'utf8');
    if (/VITE_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
      failures.push(`${relative(file)} -> referência a service role em código de runtime`);
    }
  }
}

const agreementFacade = read('features', 'agreements', 'services', 'agreementService.ts');
const forbiddenAgreementFallbacks = [
  'isMissingRpc',
  'PGRST202',
  'schema cache',
  'legacyAgreementService.processPayment',
  'legacyAgreementService.reversePayment',
  'legacyAgreementService.breakAgreement',
];
for (const forbidden of forbiddenAgreementFallbacks) {
  if (agreementFacade.includes(forbidden)) {
    failures.push(`agreementService.ts -> fallback financeiro legado proibido: ${forbidden}`);
  }
}

for (const requiredRpc of [
  'process_agreement_payment_atomic',
  'reverse_agreement_payment_atomic',
  'break_agreement_atomic',
]) {
  if (!agreementFacade.includes(requiredRpc)) {
    failures.push(`agreementService.ts -> RPC atômica obrigatória ausente: ${requiredRpc}`);
  }
}

for (const file of walk(path.join(root, 'features'))) {
  const filePath = relative(file);
  if (filePath === 'features/agreements/services/agreementService.ts') continue;
  if (filePath === 'features/agreements/services/agreementService.legacy.ts') continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('agreementService.legacy')) {
    failures.push(`${filePath} -> import direto do serviço legado de acordos`);
  }
}

const collectionWorkflow = JSON.parse(
  read('automation', 'n8n', 'workflows', 'capitalflow-daily-collections.json'),
)[0];
const scheduleNode = collectionWorkflow?.nodes?.find(
  (node) => node.id === 'capitalflow-collection-schedule',
);
const collectionCron = scheduleNode?.parameters?.rule?.interval?.[0]?.expression;
if (collectionCron !== '0 * * * *') {
  failures.push(`régua de cobrança -> cron deve ser 24h (0 * * * *), encontrado: ${collectionCron || 'ausente'}`);
}

const n8nDocs = read('docs', 'capitalflow-n8n.md');
for (const staleSchedule of ['08h e 18h', '0 8-18']) {
  if (n8nDocs.includes(staleSchedule)) {
    failures.push(`docs/capitalflow-n8n.md -> janela antiga de cobrança detectada: ${staleSchedule}`);
  }
}
if (!n8nDocs.includes('0 * * * *')) {
  failures.push('docs/capitalflow-n8n.md -> cron 24h não documentado');
}

const readme = read('README.md');
if (readme.includes('Run and deploy your AI Studio app')) {
  failures.push('README.md -> boilerplate antigo do AI Studio ainda presente');
}
if (!readme.includes('backend financeiro é a fonte de verdade')) {
  failures.push('README.md -> filosofia financeira autoritativa não documentada');
}

const requiredProductionMigrations = [
  '20260916013905_harden_agreement_payments_and_ledger_links.sql',
  '20260916013932_restore_all_installments_on_agreement_break.sql',
  '20260916014254_quality_integrity_guardrails.sql',
];
for (const migration of requiredProductionMigrations) {
  if (!fs.existsSync(path.join(root, 'supabase', 'migrations', migration))) {
    failures.push(`migration de produção ausente do Git: ${migration}`);
  }
}

if (failures.length > 0) {
  console.error('Falhas arquiteturais encontradas:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✓ domínio isolado de Supabase/UI/services');
console.log('✓ nenhuma service role detectada no código de runtime');
console.log('✓ mutações financeiras de acordo falham fechadas via RPC atômica');
console.log('✓ serviço legado de acordos não é importado fora da fachada autorizada');
console.log('✓ régua versionada e documentação permanecem alinhadas em 24h');
console.log('✓ migrations críticas de produção estão versionadas');
