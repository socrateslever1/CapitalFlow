import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
test('segredos de IA nunca entram no bundle do Vite', () => {
  const vite = read('vite.config.ts');
  for (const forbidden of ['process.env.GEMINI_API_KEY', 'VITE_GOOGLE_API_KEY', 'VITE_GEMINI_API_KEY']) {
    assert.ok(!vite.includes(forbidden), 'O Vite não pode incorporar ' + forbidden);
  }
  assert.ok(vite.includes('envPrefix: ['), 'Variáveis públicas devem ter lista explícita.');
  assert.ok(vite.includes('VITE_PUBLIC_APP_ORIGIN'));
  assert.ok(!vite.includes("'VITE_'"), 'Prefixo VITE_ global pode divulgar segredos.');
  const config = read('utils/geminiConfig.ts');
  assert.ok(!config.includes('import.meta.env'));
  assert.ok(!config.includes('process.env'));
});
test('módulos de IA chamam somente o proxy autenticado', () => {
  for (const file of [
    'services/geminiService.ts',
    'services/geminiGateway.service.ts',
    'features/legal/services/legalAIService.ts',
    'features/finance/extrato/services/extratoAIService.ts',
    'utils/statementSmartReader.ts',
  ]) {
    const content = read(file);
    for (const forbidden of ['new GoogleGenAI', 'VITE_CF_AIG_TOKEN', 'generativelanguage.googleapis.com']) {
      assert.ok(!content.includes(forbidden), file + ' não pode usar ' + forbidden);
    }
    assert.ok(content.includes('requestGemini'), file + ' deve usar o proxy');
  }
});
test('IA não cadastra lançamentos financeiros sem revisão explícita', () => {
  const parser = read('utils/statementSmartReader.ts');
  assert.ok(parser.includes('selected: false, // Always require manual review'));
  assert.ok(!parser.includes('ai-img-${idx}-${Date.now()}'));
  assert.ok(!parser.includes('date: item.date || new Date()'));
});

test('gateway usa modelo compatível e diagnostica erro externo sem divulgar segredos', () => {
  const proxy = read('supabase/functions/capitalflow-gemini-proxy/index.ts');
  assert.ok(proxy.includes("body.model : 'gemini-3.8-flash'"));
  assert.ok(proxy.includes("event: 'upstream_rejected'"));
  assert.ok(proxy.includes('upstream.status'));
  assert.ok(!proxy.includes('console.error(upstream'));
  for (const file of [
    'services/geminiService.ts', 'services/geminiGateway.service.ts',
    'features/finance/extrato/services/extratoAIService.ts',
    'utils/statementSmartReader.ts',
  ]) {
    assert.ok(read(file).includes("'gemini-3.8-flash'"), file);
    assert.ok(!read(file).includes("'gemini-2.5-flash'"), file);
  }
});
