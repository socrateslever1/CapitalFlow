import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('opção de origem da Carteira está dentro do modal Editar, não abaixo da lista', () => {
  const source = readFileSync('pages/SourcesPage.tsx', 'utf8');
  const modal = source.indexOf('{ui.editingSource && (');
  const selector = source.indexOf('<SourceWalletReferencePanel', modal);
  const image = source.indexOf('Imagem da carteira', selector);
  assert(modal > 0 && selector > modal && image > selector);
  assert(source.slice(selector, image).includes('sources={[ui.editingSource]}'));
  assert(!source.slice(0, modal).includes('<SourceWalletReferencePanel'));
});
