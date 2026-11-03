import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
test('segredos de IA nunca entram no bundle do Vite', () => {
  const vite = read('vite.config.ts');
  assert.doesNotMatch(vite, /process\\.env\\.GEMINI_API_KEY|VITE_GOOGLE_API_KEY|VITE_GEMINI_API_KEY/);
  const config = read('utils/geminiConfig.ts');
  assert.doesNotMatch(config, /import\\.meta\\.env|process\\.env/);
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
    assert.doesNotMatch(content, /new GoogleGenAI|VITE_CF_AIG_TOKEN|generativelanguage\\.googleapis\\.com/);
    assert.match(content, /requestGemini/);
  }
});
test('IA não cadastra lançamentos financeiros sem revisão explícita', () => {
  const parser = read('utils/statementSmartReader.ts');
  assert.match(parser, /selected: false, \\/\\/ Always require manual review/);
  assert.doesNotMatch(parser, /ai-img-\\$\\{idx\\}-\\$\\{Date\\.now\\(\\)\\}/);
  assert.doesNotMatch(parser, /date: item\\.date \\|\\| new Date\\(\\)/);
});
