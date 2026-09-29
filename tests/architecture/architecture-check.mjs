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

for (const artifact of [
  'fix.patch',
  'supabase.temp-cli-latest',
  'features/portal/ClientPortalView.tsx',
]) {
  if (fs.existsSync(path.join(root, artifact))) {
    failures.push(`artefato obsoleto versionado: ${artifact}`);
  }
}

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

const viteConfig = read('vite.config.ts');
if (/transform\s*\(\s*source\s*,\s*id\s*\)/.test(viteConfig)) {
  failures.push('vite.config.ts -> mutação textual de código-fonte durante o build');
}

const appRoot = read('App.tsx');
if (appRoot.includes('AnimatePresence')) {
  failures.push('App.tsx -> transição de páginas não pode manter a tela anterior montada');
}

for (const page of [
  ['features', 'simulator', 'SimulatorPanel.tsx'],
  ['pages', 'ClientsPage.tsx'],
  ['pages', 'FinancialStatementPage.tsx'],
  ['pages', 'SourcesPage.tsx'],
  ['pages', 'LegalPage.tsx'],
  ['pages', 'ProfilePage.tsx'],
  ['features', 'reports', 'pages', 'ReportsPage.tsx'],
]) {
  if (!read(...page).includes('PageHeader')) {
    failures.push(`${page.join('/')} -> cabeçalho principal fora do padrão compartilhado`);
  }
}

const shellLayout = read('layout', 'AppShell.tsx');
const headerBar = read('layout', 'HeaderBar.tsx');
const supportChat = read('features', 'support', 'OperatorSupportChat.tsx');
const supportChatService = read('services', 'supportChat.service.ts');
const supportChatMessages = read('features', 'support', 'components', 'ChatMessages.tsx');
const appHtml = read('index.html');
const appStyles = read('index.css');
if (appHtml.includes('> header h1') || appHtml.includes('> header p')) {
  failures.push('index.html -> override local não pode alterar tipografia do cabeçalho compartilhado');
}
for (const utility of ['page-header-title', 'page-header-subtitle', 'page-header-icon']) {
  if (!appStyles.includes(`@utility ${utility}`)) {
    failures.push(`index.css -> utilitário obrigatório de cabeçalho ausente: ${utility}`);
  }
}
if (shellLayout.includes("activeModal.type !== 'SUPPORT_CHAT'")) {
  failures.push('AppShell.tsx -> chat não pode ocultar a navegação inferior');
}
if (!shellLayout.includes("isSupportOpen ? 'fixed inset-0 h-dvh'")) {
  failures.push('AppShell.tsx -> chat deve travar o shell no viewport dinâmico');
}
if (!headerBar.includes('sticky top-0 z-[1000] shrink-0')) {
  failures.push('HeaderBar.tsx -> cabeçalho global não pode encolher durante o chat');
}
if (!supportChat.includes('bottom-[calc(4.75rem+env(safe-area-inset-bottom))]')) {
  failures.push('OperatorSupportChat.tsx -> chat não reserva espaço para a navegação inferior');
}
if (supportChatService.includes('crypto.randomUUID()') || !supportChatService.includes('generateUUID()')) {
  failures.push('supportChat.service.ts -> anexos devem usar UUID compatível com navegadores sem randomUUID');
}
if ((supportChatMessages.match(/useModal\(\)/g) || []).length !== 1) {
  failures.push('ChatMessages.tsx -> contexto de modal deve ser obtido uma única vez no topo do componente');
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

const paymentService = read('services', 'payments.service.ts');
const paymentPersistence = read('services', 'payments', 'paymentPersistence.ts');
const paymentEngineV4 = read('services', 'payments', 'paymentEngineV4.ts');
const ledgerReverse = read('services', 'ledger', 'ledgerReverse.ts');
const paymentEngineMigration = read('supabase', 'migrations', '20260929042054_payment_engine_v4.sql');
const capitalAdvanceMigration = read('supabase', 'migrations', '20260929042059_harden_capital_advances.sql');
const contractsService = read('services', 'contracts.service.ts');
const skillReadModelMigration = read('supabase', 'migrations', '20260929042103_ai_skills_read_models.sql');

for (const forbidden of [
  'applyPaymentDirectFallback',
  'canUseDirectPaymentFallback',
  "from('parcelas').update",
  "from('fontes').update",
  "from('payment_transactions').insert",
]) {
  if (`${paymentService}\n${paymentPersistence}`.includes(forbidden)) {
    failures.push(`pagamentos manuais -> fallback ou escrita direta proibida: ${forbidden}`);
  }
}

for (const required of ['process_financial_operation_v4', 'preview_financial_operation_v4', 'reverse_financial_operation_v4']) {
  if (!`${paymentEngineV4}\n${ledgerReverse}`.includes(required)) {
    failures.push(`Payment Engine V4 -> integração obrigatória ausente: ${required}`);
  }
}

if (/\.from\(['"](?:parcelas|contratos|fontes|perfis|transacoes|payment_transactions)['"]\)/.test(paymentEngineV4)) {
  failures.push('paymentEngineV4.ts -> acesso direto a tabela financeira proibido');
}

for (const required of [
  'pg_advisory_xact_lock',
  'for update',
  'financial_operations',
  'private.financial_actor_can_access',
  'process_financial_operation_v4',
  'preview_financial_operation_v4',
  'reverse_financial_operation_v4',
  'payment_transactions',
  'p_expected_preview',
  'v_preview is distinct from p_expected_preview',
  "revoke execute on function public.process_payment_v3_selective",
]) {
  if (!paymentEngineMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`migration Payment Engine V4 -> garantia obrigatória ausente: ${required}`);
  }
}

if (!/v_preview\s*:=\s*public\.preview_financial_operation_v4/i.test(paymentEngineMigration)) {
  failures.push('Payment Engine V4 -> execução não reutiliza a prévia autoritativa');
}

for (const forbidden of ['adminOfflineStore', "table: 'parcelas'", "table: 'fontes'", "table: 'transacoes'"]) {
  if (ledgerReverse.includes(forbidden)) {
    failures.push(`ledgerReverse.ts -> estorno financeiro cliente/offline proibido: ${forbidden}`);
  }
}

for (const required of [
  'process_lend_more_atomic',
  'reverse_capital_advance_v4',
  'pg_advisory_xact_lock',
  'private.financial_actor_can_access',
  'idempotency_key',
  'for update',
  'reversed_of_transaction_id',
  'estado financeiro divergiu do snapshot',
]) {
  if (!capitalAdvanceMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`aporte V4 -> garantia obrigatória ausente: ${required}`);
  }
}

if (contractsService.includes("rpc('apply_new_aporte_atomic'")) {
  failures.push('contracts.service.ts -> RPC legada de aporte não idempotente');
}
if (!contractsService.includes("rpc('process_lend_more_atomic'")) {
  failures.push('contracts.service.ts -> RPC V4 de aporte ausente');
}
if (!ledgerReverse.includes('reverse_capital_advance_v4')) {
  failures.push('ledgerReverse.ts -> estorno atômico de aporte ausente');
}

const skillFiles = walk(path.join(root, 'ai', 'skills'));
for (const file of skillFiles) {
  const filePath = relative(file);
  if (filePath === 'ai/skills/backend/supabaseSkillGateway.ts') continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const forbidden of ['lib/supabase', '.from(', '.rpc(', 'service_role', 'execute sql']) {
    if (text.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push(`${filePath} -> acesso de infraestrutura proibido na Skill: ${forbidden}`);
    }
  }
}

const skillGateway = read('ai', 'skills', 'backend', 'supabaseSkillGateway.ts');
if (skillGateway.includes('.from(')) {
  failures.push('supabaseSkillGateway.ts -> acesso direto a tabela proibido');
}
for (const rpc of [
  'skill_find_clients_v1',
  'skill_list_contracts_v1',
  'skill_get_debt_position_v1',
  'skill_list_installments_v1',
  'skill_list_due_v1',
  'skill_get_agreement_v1',
]) {
  if (!skillGateway.includes(rpc) || !skillReadModelMigration.includes(rpc)) {
    failures.push(`Skills READ_ONLY -> RPC autorizada ausente: ${rpc}`);
  }
}

const financialSkills = read('ai', 'skills', 'financial', 'skills.ts');
for (const required of ['enabled: false', "risk: 'FINANCIAL_WRITE'", 'requiresConfirmation: true']) {
  if (!financialSkills.includes(required)) {
    failures.push(`Skills financeiras -> bloqueio obrigatório ausente: ${required}`);
  }
}
if (/\b(update|insert|delete)\s+public\./i.test(skillReadModelMigration)) {
  failures.push('migration de Skills READ_ONLY -> mutação financeira detectada');
}
if (!skillReadModelMigration.includes('private.financial_actor_can_access')) {
  failures.push('migration de Skills READ_ONLY -> autorização de tenant ausente');
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
console.log('✓ Payment Engine V4 usa somente RPCs autorizadas e falha fechado');
console.log('✓ prévia, execução, idempotência, locks e estorno V4 possuem gates arquiteturais');
console.log('✓ aportes e novos empréstimos usam RPC idempotente com estorno por snapshot');
console.log('✓ Skills não acessam banco, SQL ou credenciais diretamente');
console.log('✓ gateway de Skills usa somente RPCs READ_ONLY autorizadas');
console.log('✓ Skills financeiras permanecem bloqueadas e exigem confirmação');
console.log('✓ navegação desmonta a página anterior imediatamente');
console.log('✓ cabeçalhos principais usam o padrão compartilhado');
console.log('✓ chat preserva a navegação inferior no celular');
