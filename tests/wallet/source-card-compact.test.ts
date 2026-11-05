import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceCard = readFileSync('components/cards/SourceCard.tsx', 'utf8');
const sourcesPage = readFileSync('pages/SourcesPage.tsx', 'utf8');

test('mantém o card compacto e sinaliza referências adicionais com +', () => {
  assert.match(sourceCard, /extraReferenceCount/);
  assert.match(sourceCard, /\+\{extraReferenceCount\}/);
  assert.doesNotMatch(sourceCard, /referenceDisplay\.entries\.map/);
  assert.match(sourceCard, /items-center justify-between gap-2/);
  assert.match(sourceCard, /text-\[9px\].*Valor associado/);
});

test('mantém o acesso ao detalhe completo pelo resumo do card', () => {
  assert.match(sourceCard, /setShowDetails\(true\)/);
  assert.match(sourceCard, /Clientes Vinculados/);
  assert.match(sourceCard, /activeLoans\.map/);
});

test('a grade não estica um card pela altura do vizinho', () => {
  assert.match(sourcesPage, /grid-cols-1[^\n]*items-start/);
});
