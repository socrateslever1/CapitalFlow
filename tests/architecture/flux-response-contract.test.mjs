import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/ai-assistant/index.ts', 'utf8');

test('Flux exige resposta financeira útil e rastreável', () => {
  assert.match(source, /Resposta direta/);
  assert.match(source, /Evidências usadas/);
  assert.match(source, /Próximos passos/);
  assert.match(source, /Se os dados não forem suficientes/);
  assert.match(source, /não invente/);
});
