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
for (const directory of ['components', 'features', 'hooks', 'pages', 'services', 'utils']) {
  for (const file of walk(path.join(root, directory))) {
    if (relative(file) === 'utils/generators.ts') continue;
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes('crypto.randomUUID(')) {
      failures.push(`${relative(file)} -> use generateUUID() para compatibilidade com navegadores antigos`);
    }
  }
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
const installmentGrid = read('components', 'cards', 'components', 'InstallmentGrid.tsx');
const paymentManagerModal = read('components', 'modals', 'PaymentManagerModal.tsx');
const ledgerReverse = read('services', 'ledger', 'ledgerReverse.ts');
const paymentEngineMigration = read('supabase', 'migrations', '20260929042054_payment_engine_v4.sql');
const capitalAdvanceMigration = read('supabase', 'migrations', '20260929042059_harden_capital_advances.sql');
const negativeCapitalAdvanceMigration = read('supabase', 'migrations', '20261004211030_allow_negative_source_balance_for_capital_advances.sql');
const contractsService = read('services', 'contracts.service.ts');
const skillReadModelMigration = read('supabase', 'migrations', '20260929042103_ai_skills_read_models.sql');
const sourceController = read('hooks', 'controllers', 'useSourceController.ts');
const profitWithdrawalMigration = read('supabase', 'migrations', '20260929224507_harden_profit_withdrawals_v2.sql');
const paymentOperatorProfileMigration = read('supabase', 'migrations', '20261002114424_align_payment_transaction_operator_profile.sql');
const paymentForgivenessMigration = read('supabase', 'migrations', '20261002135834_fix_payment_forgiveness_order_remote.sql');
const readTools = read('ai', 'tools', 'read', 'tools.ts');
const financialTools = read('ai', 'tools', 'financial', 'tools.ts');
const toolRegistry = read('ai', 'tools', 'core', 'registry.ts');
const mcpAdapter = read('ai', 'mcp', 'adapter.ts');
const mcpServer = read('ai', 'mcp', 'server.ts');
const personalWalletMigration = read('supabase', 'migrations', '20261005205751_finalize_personal_wallet_operations.sql');
const personalWalletService = read('services', 'personalWallet.service.ts');
const personalWalletPage = read('pages', 'PersonalWalletPage.tsx');
const bottomNav = read('layout', 'BottomNav.tsx');
const app = read('App.tsx');

for (const required of [
  'personal_wallet_create_expense',
  'personal_wallet_set_expense_status',
  'personal_wallet_pay_invoice',
  'for update',
  'public.is_platform_super_admin()',
  'owner_user_id = (select auth.uid())',
]) {
  if (!personalWalletMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`Minha Carteira -> garantia obrigatÃ³ria ausente: ${required}`);
  }
}
if (/from\(['"]personal_wallet_expenses['"]\)\.insert/.test(personalWalletService)) {
  failures.push('personalWallet.service.ts -> despesa pessoal nÃ£o pode ignorar a operaÃ§Ã£o atÃ´mica');
}
for (const required of ['personal_wallet_create_expense', 'personal_wallet_set_expense_status', 'personal_wallet_pay_invoice']) {
  if (!personalWalletService.includes(required)) failures.push(`personalWallet.service.ts -> RPC ausente: ${required}`);
}
for (const required of ['invoiceAccounts', 'Pagar fatura', 'Despesas recentes']) {
  if (!personalWalletPage.includes(required)) failures.push(`PersonalWalletPage.tsx -> seÃ§Ã£o obrigatÃ³ria ausente: ${required}`);
}
if (!bottomNav.includes("navOrder.includes('MY_WALLET')")) {
  failures.push('BottomNav.tsx -> Minha Carteira nÃ£o estÃ¡ condicionada ao acesso de superadministrador');
}
if (!app.includes('navOrder={visibleHubOrder}')) {
  failures.push('App.tsx -> acesso exclusivo da carteira nÃ£o foi propagado ao menu responsivo');
}

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
if (/window\.(?:confirm|alert)\s*\(/.test(installmentGrid)) {
  failures.push('InstallmentGrid.tsx -> recebimento deve usar confirmação visual interna, não alerta nativo');
}
if (/confirmada pelo backend|bloquead[ao] pelo backend/i.test(`${installmentGrid}\n${paymentManagerModal}`)) {
  failures.push('janelas de recebimento -> textos visíveis não podem expor terminologia interna');
}
if (/setQuickMode\('INTEREST_ONLY'\)[\s\S]{0,300}setPartialBalanceAction\([^)]*RENEW_KEEP_PENDING/.test(installmentGrid)) {
  failures.push('InstallmentGrid.tsx -> receber somente juros não pode renovar vencimento automaticamente');
}
for (const label of ['Quitar esta parcela', 'Receber outro valor', 'Receber somente juros', 'Receber juros e atraso']) {
  if (!installmentGrid.includes(label)) failures.push(`InstallmentGrid.tsx -> ação de recebimento sem descrição clara: ${label}`);
}
for (const required of [
  'drop constraint if exists payment_transactions_operator_profile_id_fkey',
  'references public.perfis(id)',
  'on delete set null',
  'not valid',
]) {
  if (!paymentOperatorProfileMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`migration de operador do recebimento -> garantia ausente: ${required}`);
  }
}

for (const required of ['create or replace function public.process_lend_more_atomic', 'for update', 'update public.fontes', 'insert into public.transacoes']) {
  if (!negativeCapitalAdvanceMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`aporte com fonte negativa -> garantia obrigatória ausente: ${required}`);
  }
}
if (negativeCapitalAdvanceMigration.toLowerCase().includes('saldo insuficiente na fonte de capital')) {
  failures.push('aporte com fonte negativa -> migration corretiva ainda bloqueia saldo negativo');
}
if (contractsService.includes('EDIT_CONTRACT')) {
  failures.push('contracts.service.ts -> edição de contrato não pode criar aporte oculto');
}
if (/update\s+public\.payment_transactions/i.test(paymentOperatorProfileMigration)) {
  failures.push('migration de operador do recebimento -> histórico financeiro não pode ser reescrito automaticamente');
}
const forgivenessBeforeAllocation = paymentForgivenessMigration.indexOf("v_late_fee_forgiven := least(");
const paymentAllocation = paymentForgivenessMigration.indexOf("v_interest_paid := least(");
if (forgivenessBeforeAllocation < 0 || paymentAllocation < 0 || forgivenessBeforeAllocation > paymentAllocation) {
  failures.push('migration de descontos -> dispensa deve ser aplicada antes da distribuição do recebimento');
}
if (!paymentForgivenessMigration.includes("greatest(v_late_fee_before - v_late_fee_forgiven, 0)")) {
  failures.push('migration de descontos -> valor dispensado não pode ser contabilizado como atraso recebido');
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

for (const forbidden of ['withdrawProfitCaixaLivreLegacy', "from('transacoes_caixa')", "fn: 'withdraw_profit_caixa_livre'", "fn: 'profit_withdrawal_atomic'"]) {
  if (sourceController.includes(forbidden)) failures.push(`resgate de lucro -> fallback não atômico proibido: ${forbidden}`);
}
if (!sourceController.includes("rpc('withdraw_profit_atomic_v2'")) {
  failures.push('resgate de lucro -> RPC V2 atômica ausente');
}
for (const required of ['private.financial_actor_can_access', 'pg_advisory_xact_lock', 'for update', 'idempotency_key', 'insert into public.transacoes']) {
  if (!profitWithdrawalMigration.toLowerCase().includes(required.toLowerCase())) {
    failures.push(`resgate de lucro V2 -> garantia obrigatória ausente: ${required}`);
  }
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

for (const file of walk(path.join(root, 'ai', 'tools'))) {
  const filePath = relative(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const forbidden of ['lib/supabase', '.from(', '.rpc(', 'service_role', 'execute sql']) {
    if (text.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push(`${filePath} -> acesso de infraestrutura proibido na Tool: ${forbidden}`);
    }
  }
}

for (const toolId of [
  'client.search', 'client.get', 'debt.get', 'installments.list',
  'contract.get', 'due_dates.list', 'agreement.get',
]) {
  if (!readTools.includes(`id: '${toolId}'`)) {
    failures.push(`Tools READ_ONLY -> Tool obrigatória ausente: ${toolId}`);
  }
}

for (const guard of ['TOOL_DISABLED', 'CONFIRMATION_REQUIRED', 'authorizeToolContext', 'inputSchema.safeParse']) {
  if (!toolRegistry.includes(guard)) failures.push(`ToolRegistry -> gate obrigatório ausente: ${guard}`);
}

for (const skillPath of [
  ['consultar-cliente', 'skill.ts'], ['consultar-divida', 'skill.ts'],
  ['consultar-parcelas', 'skill.ts'], ['consultar-contrato', 'skill.ts'],
  ['consultar-vencimentos', 'skill.ts'], ['consultar-acordo', 'skill.ts'],
]) {
  const text = read('ai', 'skills', ...skillPath);
  if (!text.includes('executeToolAsSkill')) {
    failures.push(`ai/skills/${skillPath.join('/')} -> Skill deve executar via ToolRegistry`);
  }
}

for (const required of [
  'payment.preview', 'payment.execute', 'payment.reverse', 'payment.capitalize',
  'payment.renew', 'payment.settle', 'loan.lend_more',
  'enabled: false', 'requiresConfirmation: true', 'STAGING_NOT_VERIFIED',
]) {
  if (!financialTools.includes(required)) failures.push(`Tools financeiras -> contrato/bloqueio ausente: ${required}`);
}

for (const mcpName of [
  'search_client', 'get_client', 'get_debt', 'list_installments',
  'get_contract', 'list_due_dates', 'get_agreement',
]) {
  if (!mcpAdapter.includes(mcpName)) failures.push(`MCP READ_ONLY -> Tool ausente: ${mcpName}`);
}
for (const forbidden of ['execute_payment:', 'reverse_payment:', 'lend_more:']) {
  if (mcpAdapter.includes(forbidden)) failures.push(`MCP V1 -> Tool financeira exposta: ${forbidden}`);
}
for (const required of ['resolveAuthenticatedContext', 'structuredContent', "tool.risk !== 'READ_ONLY'"]) {
  if (!mcpServer.includes(required)) failures.push(`MCP Server -> proteção obrigatória ausente: ${required}`);
}
for (const doc of ['AI_TOOLS.md', 'MCP.md']) {
  if (!fs.existsSync(path.join(root, 'docs', doc))) failures.push(`documentação ausente: docs/${doc}`);
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
console.log('✓ resgates de lucro usam uma única RPC atômica, idempotente e auditada');
console.log('✓ Skills não acessam banco, SQL ou credenciais diretamente');
console.log('✓ gateway de Skills usa somente RPCs READ_ONLY autorizadas');
console.log('✓ Skills financeiras permanecem bloqueadas e exigem confirmação');
console.log('✓ Skills READ_ONLY executam por uma única camada operacional de Tools');
console.log('✓ ToolRegistry valida schema, permissão, risco, confirmação e bloqueio');
console.log('✓ MCP V1 expõe somente Tools READ_ONLY com contexto autenticado injetado');
console.log('✓ navegação desmonta a página anterior imediatamente');
console.log('✓ cabeçalhos principais usam o padrão compartilhado');
console.log('✓ chat preserva a navegação inferior no celular');
