import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
test('segredos de IA nunca entram no bundle do Vite', () => {
  const vite = read('vite.config.ts');
  for (const forbidden of ['process.env.GEMINI_API_KEY', 'VITE_GOOGLE_API_KEY', 'VITE_GEMINI_API_KEY']) {
    assert.ok(!vite.includes(forbidden), 'O Vite não pode incorporar ' + forbidden);
  }
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
